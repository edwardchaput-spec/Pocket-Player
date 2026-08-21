import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { songsFixture } from '../../test/fixtures';
import { replaceQueue } from './queue';
import { usePlaybackStore } from './playbackStore';

describe('playback store queue sessions', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('renews the playback session when replaying the current queue occurrence', () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 1);
    const before = usePlaybackStore.getState().queue[1]!.playbackSessionId;
    usePlaybackStore.setState({ status: 'paused', position: 73 });

    usePlaybackStore.getState().jumpTo(1);

    const playback = usePlaybackStore.getState();
    expect(playback).toMatchObject({ currentIndex: 1, status: 'loading', position: 0 });
    expect(playback.queue[1]!.playbackSessionId).not.toBe(before);
  });

  it('renews repeat-one playback while preserving the queue occurrence', () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    usePlaybackStore.getState().cycleRepeat();
    usePlaybackStore.getState().cycleRepeat();
    const before = usePlaybackStore.getState().queue[0]!;

    usePlaybackStore.getState().next('ended');

    const after = usePlaybackStore.getState().queue[0]!;
    expect(after.occurrenceId).toBe(before.occurrenceId);
    expect(after.playbackSessionId).not.toBe(before.playbackSessionId);
    expect(usePlaybackStore.getState()).toMatchObject({ currentIndex: 0, status: 'loading' });
  });

  it('does not resurrect removed tracks or discard a reorder when shuffle is disabled', () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    usePlaybackStore.getState().toggleShuffle();
    const removedId = usePlaybackStore.getState().queue[1]!.occurrenceId;
    usePlaybackStore.getState().removeAt(1);
    usePlaybackStore.getState().toggleShuffle();

    expect(usePlaybackStore.getState().shuffleMode).toBe(false);
    expect(usePlaybackStore.getState().queue.some((item) => item.occurrenceId === removedId)).toBe(
      false,
    );

    usePlaybackStore.getState().toggleShuffle();
    usePlaybackStore.getState().move(0, 1);
    const reordered = usePlaybackStore.getState().queue.map((item) => item.occurrenceId);
    usePlaybackStore.getState().toggleShuffle();
    expect(usePlaybackStore.getState().queue.map((item) => item.occurrenceId)).toEqual(reordered);
  });

  it('restores the persisted unseen canonical order when shuffle is disabled', () => {
    const canonical = replaceQueue(songsFixture, 0);
    const visible = {
      items: [canonical.items[0]!, canonical.items[2]!, canonical.items[1]!],
      currentIndex: 0,
    };
    usePlaybackStore.getState().hydrateQueue({
      ...visible,
      unshuffledOccurrenceIds: canonical.items.map((item) => item.occurrenceId),
      position: 12,
      repeatMode: 'off',
      shuffleMode: true,
    });

    usePlaybackStore.getState().toggleShuffle();

    expect(usePlaybackStore.getState().shuffleMode).toBe(false);
    expect(usePlaybackStore.getState().queue.map((item) => item.occurrenceId)).toEqual(
      canonical.items.map((item) => item.occurrenceId),
    );
  });

  it('keeps shuffle enabled when replacing a queue from another library view', () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    usePlaybackStore.getState().toggleShuffle();

    usePlaybackStore.getState().replaceAndPlay([...songsFixture].reverse(), 1);

    const playback = usePlaybackStore.getState();
    expect(playback.shuffleMode).toBe(true);
    expect(playback.currentIndex).toBe(0);
    expect(playback.queue[0]?.track.id).toBe(songsFixture[1]?.id);
    expect(playback.unshuffledQueue?.map((item) => item.track.id)).toEqual(
      [...songsFixture].reverse().map((track) => track.id),
    );
  });

  it('starts a shuffled queue explicitly and keeps the preference after clearing it', () => {
    usePlaybackStore.getState().shuffleAndPlay(songsFixture);
    expect(usePlaybackStore.getState().shuffleMode).toBe(true);

    usePlaybackStore.getState().clear();
    expect(usePlaybackStore.getState()).toMatchObject({
      queue: [],
      currentIndex: null,
      shuffleMode: true,
    });
  });

  it('shuffles tracks appended to an active queue while preserving canonical order', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    usePlaybackStore.getState().replaceAndPlay([songsFixture[0]!], 0);
    usePlaybackStore.getState().toggleShuffle();

    usePlaybackStore.getState().append([songsFixture[1]!, songsFixture[2]!]);

    const playback = usePlaybackStore.getState();
    expect(playback.queue.map((item) => item.track.id)).toEqual([
      songsFixture[0]!.id,
      songsFixture[2]!.id,
      songsFixture[1]!.id,
    ]);
    expect(playback.unshuffledQueue?.map((item) => item.track.id)).toEqual(
      songsFixture.map((track) => track.id),
    );
    random.mockRestore();
  });

  it('preserves played history and restores only the unseen canonical tail', () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    const original = usePlaybackStore.getState().queue;
    usePlaybackStore.setState({ currentIndex: 0 });
    usePlaybackStore.getState().toggleShuffle();
    usePlaybackStore.getState().next();

    const shuffledHistory = usePlaybackStore.getState().queue.slice(0, 2);
    usePlaybackStore.getState().toggleShuffle();

    const playback = usePlaybackStore.getState();
    expect(playback.queue.slice(0, 2)).toEqual(shuffledHistory);
    expect(playback.queue.slice(2).map((item) => item.occurrenceId)).toEqual(
      original
        .filter(
          (item) => !shuffledHistory.some((played) => played.occurrenceId === item.occurrenceId),
        )
        .map((item) => item.occurrenceId),
    );
    expect(playback.currentIndex).toBe(1);
  });
});

function resetStore() {
  usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
}
