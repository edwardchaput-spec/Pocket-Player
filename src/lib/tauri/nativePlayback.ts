import { Channel, invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { normalizeAppError } from './invoke';
import { songSchema, type Song } from './types';

/**
 * Typed facade for the Android Media3 playback output (ADR-011). Commands are
 * implemented in Kotlin by the `pocket-playback` plugin and exist only on
 * Android; callers must gate on `session.platform === 'android'`.
 */

const PLUGIN = 'plugin:pocket-playback|';

export interface NativeQueueItem {
  /** Queue occurrence ID; lets duplicate tracks coexist in the native playlist. */
  mediaId: string;
  songId: string;
  url: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  artworkUrl?: string | null;
}

const stateEventSchema = z.object({
  type: z.literal('state'),
  index: z.number().int(),
  itemCount: z.number().int().nonnegative(),
  mediaId: z.string().nullish(),
  songId: z.string().nullish(),
  isPlaying: z.boolean(),
  playWhenReady: z.boolean(),
  playbackState: z.enum(['idle', 'buffering', 'ready', 'ended']),
  positionMs: z.number().nonnegative(),
  durationMs: z.number(),
});

const transitionEventSchema = z.object({
  type: z.literal('transition'),
  index: z.number().int(),
  mediaId: z.string().nullish(),
  songId: z.string().nullish(),
  reason: z.enum(['auto', 'repeat', 'seek', 'playlistChanged']),
});

const errorEventSchema = z.object({ type: z.literal('error'), code: z.string().nullish() });

const spectrumEventSchema = z.object({
  type: z.literal('spectrum'),
  frequency: z.string(),
  waveform: z.string(),
});

const externalQueueEventSchema = z.object({
  type: z.literal('externalQueue'),
  songs: z.array(songSchema).max(10_000),
  index: z.number().int().nonnegative(),
});

export const nativePlaybackEventSchema = z.discriminatedUnion('type', [
  stateEventSchema,
  transitionEventSchema,
  errorEventSchema,
  spectrumEventSchema,
  externalQueueEventSchema,
]);
export type NativePlaybackEvent = z.infer<typeof nativePlaybackEventSchema>;
export type NativeStateEvent = z.infer<typeof stateEventSchema>;
export type NativeExternalQueue = { songs: Song[]; index: number };

async function call(command: string, args?: Record<string, unknown>): Promise<void> {
  try {
    await invoke(`${PLUGIN}${command}`, args);
  } catch (cause) {
    throw normalizeAppError(cause);
  }
}

/** Subscribes to native playback events. Malformed payloads are dropped. */
export async function subscribeNativePlayback(
  onEvent: (event: NativePlaybackEvent) => void,
): Promise<void> {
  const channel = new Channel<unknown>();
  channel.onmessage = (message) => {
    const parsed = nativePlaybackEventSchema.safeParse(message);
    if (parsed.success) onEvent(parsed.data);
  };
  await call('subscribe', { channel });
}

export const configureNativePlayback = (proxyBaseUrl: string) =>
  call('configure', { proxyBaseUrl });

export const setNativeQueue = (input: {
  items: NativeQueueItem[];
  startIndex: number;
  positionMs: number;
  playWhenReady: boolean;
}) => call('set_queue', { ...input });

export const nativePlay = () => call('play');
export const nativePause = () => call('pause');
export const nativeStop = () => call('stop');
export const nativeSeekTo = (positionMs: number) =>
  call('seek_to', { positionMs: Math.max(0, Math.round(positionMs)) });
export const nativeSkipTo = (index: number, playWhenReady: boolean) =>
  call('skip_to', { index, playWhenReady });
export const nativeSetVolume = (volume: number) =>
  call('set_volume', { volume: Math.min(1, Math.max(0, volume)) });
export const nativeSetRepeatMode = (mode: 'off' | 'queue' | 'one') =>
  call('set_repeat_mode', { mode });
export const nativeSetSpectrumEnabled = (enabled: boolean) =>
  call('set_spectrum_enabled', { enabled });
