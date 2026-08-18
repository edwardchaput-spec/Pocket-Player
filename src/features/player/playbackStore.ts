import { create } from 'zustand';

import { HomeSection, PlayerSettings, QueueSnapshot, Song } from '../../lib/tauri/types';
import {
  appendQueue,
  insertNext,
  moveQueueItem,
  nextIndex,
  previousIndex,
  QueueItem,
  removeQueueItem,
  replaceQueue,
  shuffledQueue,
} from './queue';

export type PlaybackStatus =
  'idle' | 'loading' | 'playing' | 'paused' | 'stalled' | 'ended' | 'error';

interface PlaybackState {
  queue: QueueItem[];
  currentIndex: number | null;
  status: PlaybackStatus;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  visualizer: PlayerSettings['visualizer'];
  visualizerQuality: number;
  visualizerSensitivity: number;
  visualizerAutoRotate: boolean;
  visualizerRotationSeconds: number;
  visualizerRandomMode: boolean;
  visualizerFavorites: PlayerSettings['visualizerFavorites'];
  theme: PlayerSettings['theme'];
  density: PlayerSettings['density'];
  notifications: boolean;
  closeToTray: boolean;
  homeSections: HomeSection[];
  pinnedPlaylistIds: string[];
  error: string | null;
  repeatMode: 'off' | 'queue' | 'one';
  shuffleMode: boolean;
  unshuffledQueue: QueueItem[] | null;
  replaceAndPlay: (tracks: Song[], startIndex?: number) => void;
  playNext: (tracks: Song[]) => void;
  append: (tracks: Song[]) => void;
  next: (reason?: 'manual' | 'ended') => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
  move: (from: number, to: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  clear: () => void;
  setStatus: (status: PlaybackStatus) => void;
  setTiming: (position: number, duration: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setVisualizer: (visualizer: PlayerSettings['visualizer']) => void;
  setVisualizerQuality: (quality: number) => void;
  setVisualizerSensitivity: (sensitivity: number) => void;
  setVisualizerAutoRotate: (enabled: boolean) => void;
  setVisualizerRotationSeconds: (seconds: number) => void;
  setVisualizerRandomMode: (enabled: boolean) => void;
  toggleVisualizerFavorite: (visualizer: PlayerSettings['visualizer']) => void;
  setTheme: (theme: PlayerSettings['theme']) => void;
  setDensity: (density: PlayerSettings['density']) => void;
  setNotifications: (enabled: boolean) => void;
  setCloseToTray: (enabled: boolean) => void;
  setHomeSections: (sections: HomeSection[]) => void;
  setPinnedPlaylistIds: (ids: string[]) => void;
  setError: (message: string | null) => void;
  initializeSettings: (settings: PlayerSettings) => void;
  hydrateQueue: (snapshot: QueueSnapshot) => void;
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  queue: [],
  currentIndex: null,
  status: 'idle',
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  visualizer: 'bars',
  visualizerQuality: 2,
  visualizerSensitivity: 1,
  visualizerAutoRotate: false,
  visualizerRotationSeconds: 30,
  visualizerRandomMode: false,
  visualizerFavorites: [],
  theme: 'dark',
  density: 'comfortable',
  notifications: true,
  closeToTray: false,
  homeSections: [
    'newest',
    'trackMix',
    'recent',
    'frequent',
    'starredAlbums',
    'random',
    'favouriteTracks',
    'pinnedPlaylists',
  ],
  pinnedPlaylistIds: [],
  error: null,
  repeatMode: 'off',
  shuffleMode: false,
  unshuffledQueue: null,
  replaceAndPlay: (tracks, startIndex = 0) => {
    const replacement = replaceQueue(tracks, startIndex);
    set({
      queue: replacement.items,
      currentIndex: replacement.currentIndex,
      status: replacement.currentIndex == null ? 'idle' : 'loading',
      position: 0,
      duration: 0,
      error: null,
      unshuffledQueue: null,
      shuffleMode: false,
    });
  },
  playNext: (tracks) => {
    const state = get();
    const next = insertNext({ items: state.queue, currentIndex: state.currentIndex }, tracks);
    set({ queue: next.items, currentIndex: next.currentIndex });
  },
  append: (tracks) => {
    const state = get();
    const next = appendQueue({ items: state.queue, currentIndex: state.currentIndex }, tracks);
    set({
      queue: next.items,
      currentIndex: next.currentIndex,
      status: state.currentIndex == null && next.currentIndex != null ? 'loading' : state.status,
    });
  },
  next: (reason = 'manual') => {
    const state = get();
    if (reason === 'ended' && state.repeatMode === 'one' && state.currentIndex != null) {
      const queue = [...state.queue];
      const current = queue[state.currentIndex];
      if (current)
        queue[state.currentIndex] = { ...current, playbackSessionId: crypto.randomUUID() };
      set({ queue, status: 'loading', position: 0, error: null });
      return;
    }
    let index = nextIndex({ items: state.queue, currentIndex: state.currentIndex });
    if (index == null && state.repeatMode === 'queue' && state.queue.length > 0) index = 0;
    set({
      currentIndex: index,
      status: index == null ? 'ended' : 'loading',
      position: 0,
      error: null,
    });
  },
  previous: () => {
    const state = get();
    const index = previousIndex({ items: state.queue, currentIndex: state.currentIndex });
    set({
      currentIndex: index,
      status: index == null ? 'idle' : 'loading',
      position: 0,
      error: null,
    });
  },
  jumpTo: (index) => {
    const state = get();
    if (index < 0 || index >= state.queue.length) return;
    set({ currentIndex: index, status: 'loading', position: 0, error: null });
  },
  removeAt: (index) => {
    const state = get();
    const current = state.currentIndex == null ? undefined : state.queue[state.currentIndex];
    const next = removeQueueItem({ items: state.queue, currentIndex: state.currentIndex }, index);
    const nextCurrent = next.currentIndex == null ? undefined : next.items[next.currentIndex];
    set({
      queue: next.items,
      currentIndex: next.currentIndex,
      status:
        next.items.length === 0
          ? 'idle'
          : current?.occurrenceId !== nextCurrent?.occurrenceId
            ? 'loading'
            : state.status,
    });
  },
  move: (from, to) => {
    const state = get();
    const next = moveQueueItem({ items: state.queue, currentIndex: state.currentIndex }, from, to);
    set({ queue: next.items, currentIndex: next.currentIndex });
  },
  cycleRepeat: () =>
    set((state) => ({
      repeatMode:
        state.repeatMode === 'off' ? 'queue' : state.repeatMode === 'queue' ? 'one' : 'off',
    })),
  toggleShuffle: () => {
    const state = get();
    if (state.shuffleMode && state.unshuffledQueue) {
      const currentId =
        state.currentIndex == null ? undefined : state.queue[state.currentIndex]?.occurrenceId;
      const queue = state.unshuffledQueue;
      set({
        queue,
        currentIndex: currentId
          ? queue.findIndex((item) => item.occurrenceId === currentId)
          : state.currentIndex,
        shuffleMode: false,
        unshuffledQueue: null,
      });
      return;
    }
    const shuffled = shuffledQueue({ items: state.queue, currentIndex: state.currentIndex });
    set({
      queue: shuffled.items,
      currentIndex: shuffled.currentIndex,
      shuffleMode: true,
      unshuffledQueue: state.queue,
    });
  },
  clear: () =>
    set({
      queue: [],
      currentIndex: null,
      status: 'idle',
      position: 0,
      duration: 0,
      error: null,
      shuffleMode: false,
      unshuffledQueue: null,
    }),
  setStatus: (status) => set({ status }),
  setTiming: (position, duration) => set({ position, duration }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  setMuted: (muted) => set({ muted }),
  setVisualizer: (visualizer) => set({ visualizer }),
  setVisualizerQuality: (visualizerQuality) =>
    set({ visualizerQuality: Math.max(1, Math.min(3, visualizerQuality)) }),
  setVisualizerSensitivity: (visualizerSensitivity) =>
    set({ visualizerSensitivity: Math.max(0.35, Math.min(2.5, visualizerSensitivity)) }),
  setVisualizerAutoRotate: (visualizerAutoRotate) => set({ visualizerAutoRotate }),
  setVisualizerRotationSeconds: (visualizerRotationSeconds) =>
    set({ visualizerRotationSeconds: Math.max(10, Math.min(300, visualizerRotationSeconds)) }),
  setVisualizerRandomMode: (visualizerRandomMode) => set({ visualizerRandomMode }),
  toggleVisualizerFavorite: (visualizer) =>
    set((state) => ({
      visualizerFavorites: state.visualizerFavorites.includes(visualizer)
        ? state.visualizerFavorites.filter((mode) => mode !== visualizer)
        : [...state.visualizerFavorites, visualizer],
    })),
  setTheme: (theme) => set({ theme }),
  setDensity: (density) => set({ density }),
  setNotifications: (notifications) => set({ notifications }),
  setCloseToTray: (closeToTray) => set({ closeToTray }),
  setHomeSections: (homeSections) => set({ homeSections }),
  setPinnedPlaylistIds: (pinnedPlaylistIds) => set({ pinnedPlaylistIds }),
  setError: (error) => set({ error, status: error ? 'error' : get().status }),
  initializeSettings: (settings) => set(settings),
  hydrateQueue: (snapshot) =>
    set({
      queue: snapshot.items,
      currentIndex: snapshot.currentIndex,
      position: snapshot.position,
      duration:
        snapshot.currentIndex == null
          ? 0
          : (snapshot.items[snapshot.currentIndex]?.track.duration ?? 0),
      status: snapshot.currentIndex == null ? 'idle' : 'paused',
      repeatMode: snapshot.repeatMode,
      shuffleMode: snapshot.shuffleMode,
      unshuffledQueue: null,
      error: null,
    }),
}));

export function currentQueueItem(state: Pick<PlaybackState, 'queue' | 'currentIndex'>) {
  return state.currentIndex == null ? undefined : state.queue[state.currentIndex];
}
