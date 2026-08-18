import { emit, emitTo, listen, UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { PlaybackStatus } from '../../features/player/playbackStore';
import { invokeVoid } from './invoke';
import { Song } from './types';

export interface DesktopControl {
  action:
    | 'play-pause'
    | 'play'
    | 'pause'
    | 'previous'
    | 'next'
    | 'seek'
    | 'volume'
    | 'open-mini'
    | 'show-main'
    | 'navigate-main'
    | 'mini-ready';
  value?: number;
  route?: string;
}

export interface SharedPlaybackState {
  track: Song | null;
  artworkUrl: string | null;
  status: PlaybackStatus;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  queueLength: number;
  currentIndex: number | null;
}

export function isMiniPlayerWindow(): boolean {
  try {
    return getCurrentWindow().label === 'mini-player';
  } catch {
    return false;
  }
}

export async function openMiniPlayer(): Promise<void> {
  const existing = await WebviewWindow.getByLabel('mini-player');
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }
  const window = new WebviewWindow('mini-player', {
    url: '/mini-player',
    title: 'Navidrome Desktop Mini Player',
    width: 410,
    height: 180,
    minWidth: 340,
    minHeight: 150,
    resizable: true,
    decorations: true,
    alwaysOnTop: true,
  });
  await new Promise<void>((resolve, reject) => {
    void window.once('tauri://created', () => resolve());
    void window.once('tauri://error', (event) => reject(new Error(String(event.payload))));
  });
}

export const sendDesktopControl = (control: DesktopControl) =>
  emitTo('main', 'desktop-control', control);

export async function showMainWindow(): Promise<void> {
  const main = await WebviewWindow.getByLabel('main');
  await main?.show();
  await main?.setFocus();
}

export const listenDesktopControl = (
  handler: (control: DesktopControl) => void,
): Promise<UnlistenFn> =>
  listen<DesktopControl>('desktop-control', (event) => handler(event.payload));

export const emitPlaybackState = (state: SharedPlaybackState) => emit('playback-state', state);

export const listenPlaybackState = (
  handler: (state: SharedPlaybackState) => void,
): Promise<UnlistenFn> =>
  listen<SharedPlaybackState>('playback-state', (event) => handler(event.payload));

export const showTrackNotification = (title: string, body: string) =>
  invokeVoid('show_track_notification', { title, body });

export function currentDesktopWindow() {
  return getCurrentWindow();
}
