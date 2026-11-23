import { createContext, useContext } from 'react';

/** Output-agnostic controls: HTML audio on Windows, native Media3 on Android. */
export interface PlaybackTransport {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
}

const noop = () => undefined;
const DETACHED: PlaybackTransport = { play: noop, pause: noop, seek: noop };

export const PlaybackTransportContext = createContext<PlaybackTransport>(DETACHED);

/** The single playback owner's transport, for views outside the player bar. */
export function usePlaybackTransport(): PlaybackTransport {
  return useContext(PlaybackTransportContext);
}
