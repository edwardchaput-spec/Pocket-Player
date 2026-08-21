import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { SharedPlaybackState } from '../../lib/tauri/desktop';
import { songsFixture } from '../../test/fixtures';
import { MiniPlayerWindow } from './MiniPlayerWindow';

const mocks = vi.hoisted(() => ({
  close: vi.fn(() => Promise.resolve()),
  minimize: vi.fn(() => Promise.resolve()),
  setAlwaysOnTop: vi.fn(() => Promise.resolve()),
  sendDesktopControl: vi.fn(() => Promise.resolve()),
  requestPlaybackState: vi.fn(() => Promise.resolve()),
  playbackListeners: [] as Array<(state: unknown) => void>,
  playbackUnlisten: vi.fn(),
  listenPlaybackState: vi.fn((handler: (state: unknown) => void): Promise<() => void> => {
    mocks.playbackListeners.push(handler);
    return Promise.resolve(mocks.playbackUnlisten);
  }),
}));

vi.mock('../../lib/tauri/desktop', () => ({
  currentDesktopWindow: () => ({
    close: mocks.close,
    minimize: mocks.minimize,
    setAlwaysOnTop: mocks.setAlwaysOnTop,
  }),
  isMainWindowVisible: vi.fn(() => Promise.resolve(false)),
  listenPlaybackState: mocks.listenPlaybackState,
  requestPlaybackState: mocks.requestPlaybackState,
  sendDesktopControl: mocks.sendDesktopControl,
  showMainWindow: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.playbackListeners.length = 0;
});

it('uses draggable custom chrome for the frameless mini player', async () => {
  const { container } = render(<MiniPlayerWindow />);

  expect(container.querySelector('.mini-titlebar')).toHaveAttribute('data-tauri-drag-region');
  await userEvent.click(screen.getByRole('button', { name: 'Minimize mini player' }));
  await userEvent.click(screen.getByRole('button', { name: 'Close mini player' }));

  expect(mocks.minimize).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('keeps always-on-top as a crafted toggle', async () => {
  render(<MiniPlayerWindow />);

  const pin = screen.getByRole('button', { name: 'Disable always on top' });
  expect(pin).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(pin);

  await waitFor(() => expect(mocks.setAlwaysOnTop).toHaveBeenCalledWith(false));
  expect(screen.getByRole('button', { name: 'Enable always on top' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

it('observes the owner state and sends explicit matching playback controls', async () => {
  const { container } = render(<MiniPlayerWindow />);
  await waitFor(() => expect(mocks.playbackListeners).toHaveLength(1));
  const state: SharedPlaybackState = {
    track: songsFixture[0]!,
    artworkUrl: null,
    status: 'playing',
    position: 42,
    duration: 180,
    volume: 0.35,
    muted: false,
    shuffleMode: false,
    queueLength: 3,
    currentIndex: 0,
  };

  act(() => mocks.playbackListeners[0]?.(state));

  expect(container.querySelector('audio')).toBeNull();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  expect(screen.getByRole('slider', { name: 'Seek' })).toHaveValue('42');
  expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('0.35');

  await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '64' } });
  fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), {
    target: { value: '0.7' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
  await userEvent.click(screen.getByRole('button', { name: 'Enable shuffle' }));

  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'pause' });
  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'previous' });
  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'next' });
  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'seek', value: 64 });
  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'volume', value: 0.7 });
  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'mute', muted: true });
  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'toggle-shuffle' });

  act(() =>
    mocks.playbackListeners[0]?.({
      ...state,
      status: 'paused',
      muted: true,
      shuffleMode: true,
    }),
  );
  expect(screen.getByRole('button', { name: 'Disable shuffle' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Play' }));
  await userEvent.click(screen.getByRole('button', { name: 'Unmute' }));
  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'play' });
  expect(mocks.sendDesktopControl).toHaveBeenCalledWith({ action: 'mute', muted: false });
});

it('requests a fresh snapshot after subscribing and cleans up a late listener', async () => {
  let resolveListener: ((dispose: () => void) => void) | undefined;
  mocks.listenPlaybackState.mockImplementationOnce(
    () =>
      new Promise<() => void>((resolve) => {
        resolveListener = resolve;
      }),
  );
  const view = render(<MiniPlayerWindow />);

  view.unmount();
  act(() => resolveListener?.(mocks.playbackUnlisten));

  await waitFor(() => expect(mocks.playbackUnlisten).toHaveBeenCalledOnce());

  render(<MiniPlayerWindow />);
  await waitFor(() => expect(mocks.requestPlaybackState).toHaveBeenCalled());
});
