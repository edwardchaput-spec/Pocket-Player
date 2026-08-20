import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Session } from '../../lib/tauri/types';
import { showTrackNotification } from '../../lib/tauri/desktop';
import { sessionFixture, songsFixture } from '../../test/fixtures';
import { PlayerProvider } from './PlayerProvider';
import { usePlaybackStore } from './playbackStore';
import { replaceQueue } from './queue';

const desktopMocks = vi.hoisted(() => ({
  controlListeners: [] as Array<(control: unknown) => void>,
  desktopUnlisten: vi.fn(),
  closeUnlisten: vi.fn(),
  emitPlaybackState: vi.fn(() => Promise.resolve()),
  listenDesktopControl: vi.fn((handler: (control: unknown) => void): Promise<() => void> => {
    desktopMocks.controlListeners.push(handler);
    return Promise.resolve(desktopMocks.desktopUnlisten);
  }),
}));

vi.mock('../../lib/tauri/playback', () => ({
  recordPlaybackEvent: vi.fn(() => Promise.resolve()),
  reportScrobble: vi.fn(() => Promise.resolve(true)),
  savePlayerSettings: vi.fn(() => Promise.resolve()),
  saveQueueSnapshot: vi.fn(() => Promise.resolve()),
  syncPlayQueue: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/tauri/desktop', () => ({
  currentDesktopWindow: vi.fn(() => ({
    hide: vi.fn(() => Promise.resolve()),
    onCloseRequested: vi.fn(() => Promise.resolve(desktopMocks.closeUnlisten)),
    setFocus: vi.fn(() => Promise.resolve()),
    show: vi.fn(() => Promise.resolve()),
  })),
  emitPlaybackState: desktopMocks.emitPlaybackState,
  listenDesktopControl: desktopMocks.listenDesktopControl,
  openMiniPlayer: vi.fn(() => Promise.resolve()),
  showTrackNotification: vi.fn(() => Promise.resolve()),
}));

const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load');

beforeEach(() => {
  vi.clearAllMocks();
  desktopMocks.controlListeners.length = 0;
  usePlaybackStore.getState().clear();
});

describe('PlayerProvider startup playback', () => {
  it('loads and seeks a restored queue without starting playback', async () => {
    const queue = replaceQueue(songsFixture, 1);
    const session: Session = {
      ...sessionFixture,
      queueSnapshot: {
        ...queue,
        position: 42,
        repeatMode: 'off',
        shuffleMode: false,
      },
    };
    const { container } = renderPlayer(session);
    const audio = container.querySelector('audio');

    await waitFor(() => expect(loadSpy).toHaveBeenCalled());
    expect(audio).not.toBeNull();
    expect(audio?.src).toContain('/stream/song-3');
    expect(usePlaybackStore.getState()).toMatchObject({
      currentIndex: 1,
      position: 42,
      status: 'paused',
    });
    expect(playSpy).not.toHaveBeenCalled();
    expect(pauseSpy).toHaveBeenCalled();
    expect(showTrackNotification).not.toHaveBeenCalled();

    fireEvent.loadStart(audio!);
    expect(usePlaybackStore.getState().status).toBe('paused');

    Object.defineProperty(audio, 'duration', { configurable: true, value: 180 });
    fireEvent.loadedMetadata(audio!);
    expect(audio?.currentTime).toBe(42);
  });

  it('still starts playback for a deliberate play-now action', async () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    renderPlayer(sessionFixture);

    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(showTrackNotification).toHaveBeenCalledTimes(1));
  });

  it('reloads the same occurrence for repeat-one with a fresh playback session', async () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    renderPlayer(sessionFixture);
    await waitFor(() => expect(loadSpy).toHaveBeenCalled());
    const loadCount = loadSpy.mock.calls.length;
    const before = usePlaybackStore.getState().queue[0]!.playbackSessionId;

    act(() => {
      usePlaybackStore.getState().cycleRepeat();
      usePlaybackStore.getState().cycleRepeat();
      usePlaybackStore.getState().next('ended');
    });

    await waitFor(() => expect(loadSpy.mock.calls.length).toBeGreaterThan(loadCount));
    expect(usePlaybackStore.getState().queue[0]!.playbackSessionId).not.toBe(before);
  });

  it('routes mini controls through the single main-window audio owner', async () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 1);
    const { container } = renderPlayer(sessionFixture);
    await waitFor(() => expect(desktopMocks.controlListeners).toHaveLength(1));
    const listener = desktopMocks.controlListeners[0]!;
    const audio = container.querySelector('audio')!;
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();

    // A pending play() can still report paused=true; an explicit pause must cancel it anyway.
    Object.defineProperty(audio, 'paused', { configurable: true, value: true });
    act(() => listener({ action: 'pause' }));
    expect(pauseSpy).toHaveBeenCalled();
    expect(usePlaybackStore.getState().status).toBe('paused');
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();

    act(() => listener({ action: 'play' }));
    expect(playSpy).toHaveBeenCalled();

    act(() => listener({ action: 'previous' }));
    expect(usePlaybackStore.getState().currentIndex).toBe(0);
    act(() => listener({ action: 'next' }));
    expect(usePlaybackStore.getState().currentIndex).toBe(1);

    Object.defineProperty(audio, 'duration', { configurable: true, value: 180 });
    act(() => listener({ action: 'seek', value: 64 }));
    expect(audio.currentTime).toBe(64);
    expect(usePlaybackStore.getState().position).toBe(64);

    act(() => listener({ action: 'volume', value: 0.45 }));
    act(() => listener({ action: 'mute', muted: true }));
    expect(usePlaybackStore.getState()).toMatchObject({ volume: 0.45, muted: true });
    await waitFor(() => {
      expect(audio.volume).toBe(0.45);
      expect(audio.muted).toBe(true);
    });

    fireEvent.playing(audio);
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 65 });
    fireEvent.timeUpdate(audio);
    await waitFor(() =>
      expect(desktopMocks.emitPlaybackState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'playing',
          position: 65,
          volume: 0.45,
          muted: true,
          currentIndex: 1,
        }),
      ),
    );
  });

  it('disposes a desktop listener that resolves after the provider unmounts', async () => {
    let resolveListener: ((dispose: () => void) => void) | undefined;
    desktopMocks.listenDesktopControl.mockImplementationOnce(
      () =>
        new Promise<() => void>((resolve) => {
          resolveListener = resolve;
        }),
    );
    const view = renderPlayer(sessionFixture);

    view.unmount();
    act(() => resolveListener?.(desktopMocks.desktopUnlisten));

    await waitFor(() => expect(desktopMocks.desktopUnlisten).toHaveBeenCalledOnce());
  });
});

function renderPlayer(session: Session) {
  return render(
    <MemoryRouter>
      <PlayerProvider session={session}>
        <main>Library</main>
      </PlayerProvider>
    </MemoryRouter>,
  );
}
