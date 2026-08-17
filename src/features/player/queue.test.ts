import { describe, expect, it } from 'vitest';

import { songsFixture } from '../../test/fixtures';
import {
  appendQueue,
  insertNext,
  moveQueueItem,
  nextIndex,
  orderedAlbumTracks,
  previousIndex,
  removeQueueItem,
  replaceQueue,
  shuffledQueue,
} from './queue';

describe('queue functions', () => {
  it('replaces the queue and starts at a selected track', () => {
    const state = replaceQueue(songsFixture, 1);
    expect(state.currentIndex).toBe(1);
    expect(state.items).toHaveLength(3);
    expect(new Set(state.items.map((item) => item.playbackSessionId)).size).toBe(3);
    expect(nextIndex(state)).toBe(2);
    expect(previousIndex(state)).toBe(0);
  });

  it('orders tracks by disc and track while retaining string IDs', () => {
    const ordered = orderedAlbumTracks(songsFixture);
    expect(ordered.map((song) => song.id)).toEqual(['song-1', 'song-2', 'song-3']);
    expect(ordered.map((song) => song.discNumber)).toEqual([1, 1, 2]);
  });

  it('preserves duplicate tracks as distinct queue occurrences', () => {
    const state = appendQueue(replaceQueue([songsFixture[0]!]), [songsFixture[0]!]);
    expect(state.items.map((item) => item.track.id)).toEqual(['song-2', 'song-2']);
    expect(state.items[0]?.occurrenceId).not.toBe(state.items[1]?.occurrenceId);
  });

  it('inserts next and retains the current occurrence while moving and removing rows', () => {
    const initial = replaceQueue(songsFixture, 1);
    const currentId = initial.items[1]?.occurrenceId;
    const inserted = insertNext(initial, [songsFixture[0]!]);
    expect(inserted.items[2]?.track.id).toBe('song-2');
    const moved = moveQueueItem(inserted, 1, 3);
    expect(moved.items[moved.currentIndex!]?.occurrenceId).toBe(currentId);
    const removed = removeQueueItem(moved, 0);
    expect(removed.items[removed.currentIndex!]?.occurrenceId).toBe(currentId);
  });

  it('shuffles deterministically while keeping the current item first', () => {
    const initial = replaceQueue(songsFixture, 1);
    const shuffled = shuffledQueue(initial, () => 0);
    expect(shuffled.currentIndex).toBe(0);
    expect(shuffled.items[0]?.track.id).toBe('song-3');
    expect(shuffled.items.map((item) => item.track.id)).toEqual(['song-3', 'song-1', 'song-2']);
  });
});
