import { create } from 'zustand';

import {
  DEFAULT_DETAILED_TRACK_COLUMNS,
  DEFAULT_STANDARD_TRACK_COLUMNS,
  HomeSection,
  PlayerSettings,
  QueueSnapshot,
  Song,
  TrackTableColumnId,
} from '../../lib/tauri/types';
import {
  appendQueue,
  insertNext,
  moveQueueItem,
  nextIndex,
  previousIndex,
  QueueItem,
  removeQueueItem,
  replaceQueue,
  shuffledReplacementQueue,
  shuffledQueue,
  shuffleUpcoming,
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
  customColors: PlayerSettings['customColors'];
  density: PlayerSettings['density'];
  notifications: boolean;
  closeToTray: boolean;
  homeSections: HomeSection[];
  pinnedPlaylistIds: string[];
  trackTableColumns: PlayerSettings['trackTableColumns'];
  error: string | null;
  repeatMode: 'off' | 'queue' | 'one';
  shuffleMode: boolean;
  unshuffledQueue: QueueItem[] | null;
  replaceAndPlay: (tracks: Song[], startIndex?: number) => void;
  shuffleAndPlay: (tracks: Song[]) => void;
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
  setCustomColor: (token: keyof PlayerSettings['customColors'], color: string | null) => void;
  resetCustomColors: () => void;
  setDensity: (density: PlayerSettings['density']) => void;
  setNotifications: (enabled: boolean) => void;
  setCloseToTray: (enabled: boolean) => void;
  setHomeSections: (sections: HomeSection[]) => void;
  setPinnedPlaylistIds: (ids: string[]) => void;
  setTrackTableColumns: (
    preset: keyof PlayerSettings['trackTableColumns'],
    columns: TrackTableColumnId[],
  ) => void;
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
  customColors: { accent: null, background: null, surface: null },
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
  trackTableColumns: {
    standard: [...DEFAULT_STANDARD_TRACK_COLUMNS],
    detailed: [...DEFAULT_DETAILED_TRACK_COLUMNS],
  },
  error: null,
  repeatMode: 'off',
  shuffleMode: false,
  unshuffledQueue: null,
  replaceAndPlay: (tracks, startIndex) => {
    const state = get();
    const replacement = replaceQueue(tracks, startIndex ?? 0);
    if (state.shuffleMode) {
      const shuffled =
        startIndex == null ? shuffledReplacementQueue(replacement) : shuffledQueue(replacement);
      set({
        queue: shuffled.items,
        currentIndex: shuffled.currentIndex,
        status: shuffled.currentIndex == null ? 'idle' : 'loading',
        position: 0,
        duration: 0,
        error: null,
        unshuffledQueue: replacement.items.length ? replacement.items : null,
      });
      return;
    }
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
  shuffleAndPlay: (tracks) => {
    const replacement = replaceQueue(tracks);
    const shuffled = shuffledReplacementQueue(replacement);
    set({
      queue: shuffled.items,
      currentIndex: shuffled.currentIndex,
      status: shuffled.currentIndex == null ? 'idle' : 'loading',
      position: 0,
      duration: 0,
      error: null,
      shuffleMode: true,
      unshuffledQueue: replacement.items.length ? replacement.items : null,
    });
  },
  playNext: (tracks) => {
    const state = get();
    const next = insertNext({ items: state.queue, currentIndex: state.currentIndex }, tracks);
    set({
      queue: next.items,
      currentIndex: next.currentIndex,
      // An insertion relative to shuffled order makes that visible order canonical.
      unshuffledQueue: state.shuffleMode ? next.items : state.unshuffledQueue,
    });
  },
  append: (tracks) => {
    if (tracks.length === 0) return;
    const state = get();
    const next = appendQueue({ items: state.queue, currentIndex: state.currentIndex }, tracks);
    const additions = next.items.slice(state.queue.length);
    const visible = state.shuffleMode
      ? state.currentIndex == null
        ? shuffledReplacementQueue(next)
        : shuffleUpcoming(next)
      : next;
    set({
      queue: visible.items,
      currentIndex: visible.currentIndex,
      status: state.currentIndex == null && visible.currentIndex != null ? 'loading' : state.status,
      unshuffledQueue: state.shuffleMode
        ? [...(state.unshuffledQueue ?? state.queue), ...additions]
        : state.unshuffledQueue,
    });
  },
  next: (reason = 'manual') => {
    const state = get();
    if (reason === 'ended' && state.repeatMode === 'one' && state.currentIndex != null) {
      const renewed = renewPlaybackSession(state.queue, state.currentIndex);
      set({
        queue: renewed.queue,
        status: 'loading',
        position: 0,
        error: null,
        unshuffledQueue: mirrorPlaybackSession(state.unshuffledQueue, renewed.item),
      });
      return;
    }
    let index = nextIndex({ items: state.queue, currentIndex: state.currentIndex });
    if (index == null && state.repeatMode === 'queue' && state.queue.length > 0) index = 0;
    const renewed = renewPlaybackSession(state.queue, index);
    set({
      queue: renewed.queue,
      currentIndex: index,
      status: index == null ? 'ended' : 'loading',
      position: 0,
      error: null,
      unshuffledQueue: mirrorPlaybackSession(state.unshuffledQueue, renewed.item),
    });
  },
  previous: () => {
    const state = get();
    const index = previousIndex({ items: state.queue, currentIndex: state.currentIndex });
    const renewed = renewPlaybackSession(state.queue, index);
    set({
      queue: renewed.queue,
      currentIndex: index,
      status: index == null ? 'idle' : 'loading',
      position: 0,
      error: null,
      unshuffledQueue: mirrorPlaybackSession(state.unshuffledQueue, renewed.item),
    });
  },
  jumpTo: (index) => {
    const state = get();
    if (index < 0 || index >= state.queue.length) return;
    const renewed = renewPlaybackSession(state.queue, index);
    set({
      queue: renewed.queue,
      currentIndex: index,
      status: 'loading',
      position: 0,
      error: null,
      unshuffledQueue: mirrorPlaybackSession(state.unshuffledQueue, renewed.item),
    });
  },
  removeAt: (index) => {
    const state = get();
    const current = state.currentIndex == null ? undefined : state.queue[state.currentIndex];
    const removedOccurrenceId = state.queue[index]?.occurrenceId;
    const next = removeQueueItem({ items: state.queue, currentIndex: state.currentIndex }, index);
    let queue = next.items;
    let nextCurrent = next.currentIndex == null ? undefined : queue[next.currentIndex];
    let unshuffledQueue = removedOccurrenceId
      ? (state.unshuffledQueue?.filter((item) => item.occurrenceId !== removedOccurrenceId) ?? null)
      : state.unshuffledQueue;
    if (next.currentIndex != null && current?.occurrenceId !== nextCurrent?.occurrenceId) {
      const renewed = renewPlaybackSession(queue, next.currentIndex);
      queue = renewed.queue;
      nextCurrent = renewed.item;
      unshuffledQueue = mirrorPlaybackSession(unshuffledQueue, renewed.item);
    }
    set({
      queue,
      currentIndex: next.currentIndex,
      status:
        queue.length === 0
          ? 'idle'
          : current?.occurrenceId !== nextCurrent?.occurrenceId
            ? 'loading'
            : state.status,
      shuffleMode: state.shuffleMode,
      unshuffledQueue: queue.length === 0 ? null : unshuffledQueue,
    });
  },
  move: (from, to) => {
    const state = get();
    const next = moveQueueItem({ items: state.queue, currentIndex: state.currentIndex }, from, to);
    set({
      queue: next.items,
      currentIndex: next.currentIndex,
      // A deliberate reorder replaces the hidden pre-shuffle order.
      unshuffledQueue: state.shuffleMode ? next.items : state.unshuffledQueue,
    });
  },
  cycleRepeat: () =>
    set((state) => ({
      repeatMode:
        state.repeatMode === 'off' ? 'queue' : state.repeatMode === 'queue' ? 'one' : 'off',
    })),
  toggleShuffle: () => {
    const state = get();
    if (state.shuffleMode) {
      const played = state.currentIndex == null ? [] : state.queue.slice(0, state.currentIndex + 1);
      const playedIds = new Set(played.map((item) => item.occurrenceId));
      const queue = [
        ...played,
        ...(state.unshuffledQueue ?? state.queue).filter(
          (item) => !playedIds.has(item.occurrenceId),
        ),
      ];
      set({
        queue,
        currentIndex: state.currentIndex,
        shuffleMode: false,
        unshuffledQueue: null,
      });
      return;
    }
    const shuffled = shuffleUpcoming({ items: state.queue, currentIndex: state.currentIndex });
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
  setCustomColor: (token, color) => {
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) return;
    set((state) => ({
      customColors: { ...state.customColors, [token]: color?.toLowerCase() ?? null },
    }));
  },
  resetCustomColors: () => set({ customColors: { accent: null, background: null, surface: null } }),
  setDensity: (density) => set({ density }),
  setNotifications: (notifications) => set({ notifications }),
  setCloseToTray: (closeToTray) => set({ closeToTray }),
  setHomeSections: (homeSections) => set({ homeSections }),
  setPinnedPlaylistIds: (pinnedPlaylistIds) => set({ pinnedPlaylistIds }),
  setTrackTableColumns: (preset, columns) => {
    const unique = [...new Set(columns.filter((column) => column !== 'title'))];
    set((state) => ({
      trackTableColumns: {
        ...state.trackTableColumns,
        [preset]: ['title', ...unique],
      },
    }));
  },
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
      unshuffledQueue: restoreUnshuffledQueue(snapshot),
      error: null,
    }),
}));

export function currentQueueItem(state: Pick<PlaybackState, 'queue' | 'currentIndex'>) {
  return state.currentIndex == null ? undefined : state.queue[state.currentIndex];
}

function renewPlaybackSession(queue: QueueItem[], index: number | null) {
  if (index == null) return { queue, item: undefined };
  const current = queue[index];
  if (!current) return { queue, item: undefined };
  const item = { ...current, playbackSessionId: crypto.randomUUID() };
  const renewedQueue = [...queue];
  renewedQueue[index] = item;
  return { queue: renewedQueue, item };
}

function mirrorPlaybackSession(original: QueueItem[] | null, renewed: QueueItem | undefined) {
  if (!original || !renewed) return original;
  return original.map((item) =>
    item.occurrenceId === renewed.occurrenceId
      ? { ...item, playbackSessionId: renewed.playbackSessionId }
      : item,
  );
}

function restoreUnshuffledQueue(snapshot: QueueSnapshot): QueueItem[] | null {
  if (!snapshot.shuffleMode || !snapshot.unshuffledOccurrenceIds) return null;
  const visibleByOccurrence = new Map(snapshot.items.map((item) => [item.occurrenceId, item]));
  const restored = snapshot.unshuffledOccurrenceIds.flatMap((occurrenceId) => {
    const item = visibleByOccurrence.get(occurrenceId);
    return item ? [item] : [];
  });
  return restored.length === snapshot.items.length && new Set(restored).size === restored.length
    ? restored
    : null;
}
