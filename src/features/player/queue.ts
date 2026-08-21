import { Song } from '../../lib/tauri/types';

export interface QueueItem {
  occurrenceId: string;
  playbackSessionId: string;
  track: Song;
}

export interface QueueState {
  items: QueueItem[];
  currentIndex: number | null;
}

export function queueItem(track: Song): QueueItem {
  return {
    occurrenceId: crypto.randomUUID(),
    playbackSessionId: crypto.randomUUID(),
    track,
  };
}

export function replaceQueue(tracks: Song[], startIndex = 0): QueueState {
  if (tracks.length === 0) return { items: [], currentIndex: null };
  const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
  return { items: tracks.map(queueItem), currentIndex: safeIndex };
}

export function nextIndex(state: QueueState): number | null {
  if (state.currentIndex == null || state.currentIndex + 1 >= state.items.length) return null;
  return state.currentIndex + 1;
}

export function previousIndex(state: QueueState): number | null {
  if (state.currentIndex == null) return null;
  return Math.max(0, state.currentIndex - 1);
}

export function insertNext(state: QueueState, tracks: Song[]): QueueState {
  if (tracks.length === 0) return state;
  const additions = tracks.map(queueItem);
  if (state.currentIndex == null) {
    return { items: [...state.items, ...additions], currentIndex: state.items.length };
  }
  const at = state.currentIndex + 1;
  return {
    items: [...state.items.slice(0, at), ...additions, ...state.items.slice(at)],
    currentIndex: state.currentIndex,
  };
}

export function appendQueue(state: QueueState, tracks: Song[]): QueueState {
  if (tracks.length === 0) return state;
  const items = [...state.items, ...tracks.map(queueItem)];
  return { items, currentIndex: state.currentIndex ?? 0 };
}

export function removeQueueItem(state: QueueState, index: number): QueueState {
  if (index < 0 || index >= state.items.length) return state;
  const items = state.items.filter((_, itemIndex) => itemIndex !== index);
  if (items.length === 0) return { items: [], currentIndex: null };
  if (state.currentIndex == null) return { items, currentIndex: null };
  if (index < state.currentIndex) return { items, currentIndex: state.currentIndex - 1 };
  if (index === state.currentIndex) {
    return { items, currentIndex: Math.min(index, items.length - 1) };
  }
  return { items, currentIndex: state.currentIndex };
}

export function moveQueueItem(state: QueueState, from: number, to: number): QueueState {
  if (from < 0 || from >= state.items.length || to < 0 || to >= state.items.length || from === to) {
    return state;
  }
  const currentOccurrence =
    state.currentIndex == null ? undefined : state.items[state.currentIndex]?.occurrenceId;
  const items = [...state.items];
  const [moved] = items.splice(from, 1);
  if (!moved) return state;
  items.splice(to, 0, moved);
  const currentIndex = currentOccurrence
    ? items.findIndex((item) => item.occurrenceId === currentOccurrence)
    : null;
  return { items, currentIndex };
}

export function shuffledQueue(state: QueueState, random: () => number = Math.random): QueueState {
  if (state.items.length < 2) return state;
  const current = state.currentIndex == null ? undefined : state.items[state.currentIndex];
  const rest = state.items.filter((item) => item.occurrenceId !== current?.occurrenceId);
  shuffleItems(rest, random);
  return current
    ? { items: [current, ...rest], currentIndex: 0 }
    : { items: rest, currentIndex: null };
}

/** Shuffle only tracks that have not played yet, retaining history and the current occurrence. */
export function shuffleUpcoming(state: QueueState, random: () => number = Math.random): QueueState {
  if (state.items.length < 2) return state;
  const boundary = state.currentIndex == null ? 0 : state.currentIndex + 1;
  const upcoming = state.items.slice(boundary);
  shuffleItems(upcoming, random);
  return {
    items: [...state.items.slice(0, boundary), ...upcoming],
    currentIndex: state.currentIndex,
  };
}

/** Build a fresh shuffled queue where every track, including the first, is randomized. */
export function shuffledReplacementQueue(
  replacement: QueueState,
  random: () => number = Math.random,
): QueueState {
  if (replacement.items.length < 2) return replacement;
  const startIndex = Math.min(
    replacement.items.length - 1,
    Math.floor(random() * replacement.items.length),
  );
  return shuffledQueue({ ...replacement, currentIndex: startIndex }, random);
}

export function orderedAlbumTracks(tracks: Song[]): Song[] {
  return [...tracks].sort(
    (left, right) =>
      (left.discNumber ?? 1) - (right.discNumber ?? 1) ||
      (left.track ?? Number.MAX_SAFE_INTEGER) - (right.track ?? Number.MAX_SAFE_INTEGER) ||
      left.title.localeCompare(right.title),
  );
}

function shuffleItems<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap]!, items[index]!];
  }
}
