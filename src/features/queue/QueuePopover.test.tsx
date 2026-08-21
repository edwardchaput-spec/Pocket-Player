import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatDuration } from '../../lib/format';
import { songsFixture } from '../../test/fixtures';
import { replaceQueue } from '../player/queue';
import { usePlaybackStore } from '../player/playbackStore';
import { QueuePopover } from './QueuePopover';

const queueSongs = songsFixture.map((song) => ({
  ...song,
  artist: `${song.title} Artist`,
  album: `${song.title} Album`,
}));

describe('QueuePopover', () => {
  beforeEach(() => {
    usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
    const queue = replaceQueue(queueSongs, 1);
    usePlaybackStore.setState({
      queue: queue.items,
      currentIndex: queue.currentIndex,
      status: 'paused',
      position: 42,
      duration: 180,
    });
  });

  afterEach(() => {
    cleanup();
    usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
  });

  it('shows the queue without navigation and allows jump, move, and remove actions', async () => {
    const user = userEvent.setup();
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      <>
        <button ref={triggerRef}>Queue trigger</button>
        <QueuePopover open onClose={vi.fn()} triggerRef={triggerRef} />
      </>,
    );

    expect(screen.getByRole('region', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.getByLabelText('2 of 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Now playing Third, 0:42 of 3:00')).toBeInTheDocument();

    for (const song of queueSongs) {
      const rowButton = screen.getByRole('button', {
        name: `Play ${song.title}, by ${song.artist}, from ${song.album}, ${formatDuration(song.duration)}`,
      });
      const row = rowButton.closest('li');
      expect(row).not.toBeNull();
      expect(within(row!).getByText(song.title, { selector: 'strong' })).toBeVisible();
      expect(
        within(row!).getByText(`${song.artist} · ${song.album}`, { selector: 'small' }),
      ).toBeVisible();
      expect(
        within(row!).getByText(formatDuration(song.duration), {
          selector: '.queue-popover__duration',
        }),
      ).toBeVisible();
    }

    await user.click(
      screen.getByRole('button', {
        name: 'Play First, by First Artist, from First Album, 3:10',
      }),
    );
    expect(usePlaybackStore.getState()).toMatchObject({ currentIndex: 2, status: 'loading' });

    await user.click(screen.getByRole('button', { name: 'Move Second down' }));
    expect(usePlaybackStore.getState().queue.map((item) => item.track.title)).toEqual([
      'Third',
      'Second',
      'First',
    ]);

    await user.click(screen.getByRole('button', { name: 'Remove Second from queue' }));
    expect(usePlaybackStore.getState().queue.map((item) => item.track.title)).toEqual([
      'Third',
      'First',
    ]);
  });

  it('closes on Escape or an outside pointer press', () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const onClose = vi.fn();
    render(
      <>
        <button ref={triggerRef}>Queue trigger</button>
        <QueuePopover open onClose={onClose} triggerRef={triggerRef} />
        <button>Outside</button>
      </>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(triggerRef.current).toHaveFocus();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('restarts the selected current occurrence with a fresh playback session', async () => {
    const user = userEvent.setup();
    const triggerRef = createRef<HTMLButtonElement>();
    const before = usePlaybackStore.getState().queue[1]!.playbackSessionId;
    usePlaybackStore.setState({ position: 42 });
    render(
      <>
        <button ref={triggerRef}>Queue trigger</button>
        <QueuePopover open onClose={vi.fn()} triggerRef={triggerRef} />
      </>,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Play Third, by Third Artist, from Third Album, 3:00',
      }),
    );

    const playback = usePlaybackStore.getState();
    expect(playback.currentIndex).toBe(1);
    expect(playback.position).toBe(0);
    expect(playback.status).toBe('loading');
    expect(playback.queue[1]!.playbackSessionId).not.toBe(before);
  });
});
