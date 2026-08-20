import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

  it('turns off a restored shuffle state without reshuffling the canonical snapshot', () => {
    const snapshot = replaceQueue(songsFixture, 1);
    usePlaybackStore.getState().hydrateQueue({
      ...snapshot,
      position: 12,
      repeatMode: 'off',
      shuffleMode: true,
    });
    const order = snapshot.items.map((item) => item.occurrenceId);

    usePlaybackStore.getState().toggleShuffle();

    expect(usePlaybackStore.getState().shuffleMode).toBe(false);
    expect(usePlaybackStore.getState().queue.map((item) => item.occurrenceId)).toEqual(order);
  });
});

function resetStore() {
  usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
}
