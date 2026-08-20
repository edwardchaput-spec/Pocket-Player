import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(() => Promise.resolve()),
  emitTo: vi.fn(() => Promise.resolve()),
  globalListen: vi.fn(() => Promise.resolve(() => undefined)),
  getByLabel: vi.fn((label: string) => {
    void label;
    return Promise.resolve<{
      unminimize: () => Promise<void>;
      show: () => Promise<void>;
      setFocus: () => Promise<void>;
    } | null>(null);
  }),
  windowCreated: vi.fn(),
  windowListen: vi.fn((_event: string, _handler: (event: { payload: unknown }) => void) => {
    void _event;
    void _handler;
    return Promise.resolve(() => undefined);
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: mocks.emit,
  emitTo: mocks.emitTo,
  listen: mocks.globalListen,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class WebviewWindowMock {
    static getCurrent() {
      return { listen: mocks.windowListen };
    }

    static getByLabel(label: string) {
      return mocks.getByLabel(label);
    }

    constructor(label: string, options: unknown) {
      mocks.windowCreated(label, options);
    }

    once(_event: string, handler: (event: { payload: unknown }) => void) {
      handler({ payload: null });
      return Promise.resolve(() => undefined);
    }
  },
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main' }),
}));

import {
  DesktopControl,
  emitPlaybackState,
  listenDesktopControl,
  listenPlaybackState,
  openMiniPlayer,
  sendDesktopControl,
  SharedPlaybackState,
} from './desktop';

describe('desktop playback controls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the mini player with frameless crafted chrome', async () => {
    await openMiniPlayer();

    expect(mocks.windowCreated).toHaveBeenCalledWith(
      'mini-player',
      expect.objectContaining({
        decorations: false,
        shadow: true,
        alwaysOnTop: true,
      }),
    );
  });

  it('restores and resynchronises an existing mini-player window', async () => {
    const existing = {
      unminimize: vi.fn(() => Promise.resolve()),
      show: vi.fn(() => Promise.resolve()),
      setFocus: vi.fn(() => Promise.resolve()),
    };
    mocks.getByLabel.mockResolvedValueOnce(existing);

    await openMiniPlayer();

    expect(existing.unminimize).toHaveBeenCalledOnce();
    expect(existing.show).toHaveBeenCalledOnce();
    expect(existing.setFocus).toHaveBeenCalledOnce();
    expect(mocks.emitTo).toHaveBeenCalledWith('main', 'desktop-control', {
      action: 'mini-ready',
    });
  });

  it('targets playback commands at the main webview window', async () => {
    const control: DesktopControl = { action: 'play-pause' };

    await sendDesktopControl(control);

    expect(mocks.emitTo).toHaveBeenCalledWith('main', 'desktop-control', control);
  });

  it('registers the control listener on the matching webview window target', async () => {
    const handler = vi.fn();
    await listenDesktopControl(handler);
    const listener = mocks.windowListen.mock.calls[0]?.[1] as
      ((event: { payload: DesktopControl }) => void) | undefined;

    listener?.({ payload: { action: 'next' } });

    expect(mocks.windowListen).toHaveBeenCalledWith('desktop-control', expect.any(Function));
    expect(mocks.globalListen).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith({ action: 'next' });
  });

  it('targets playback snapshots at the mini window and listens on its webview', async () => {
    const state: SharedPlaybackState = {
      track: null,
      artworkUrl: null,
      status: 'paused',
      position: 12,
      duration: 90,
      volume: 0.6,
      muted: false,
      queueLength: 1,
      currentIndex: 0,
    };
    const handler = vi.fn();

    await emitPlaybackState(state);
    await listenPlaybackState(handler);
    const playbackCall = mocks.windowListen.mock.calls.find(
      ([event]) => event === 'playback-state',
    );
    const listener = playbackCall?.[1] as
      ((event: { payload: SharedPlaybackState }) => void) | undefined;
    listener?.({ payload: state });

    expect(mocks.emitTo).toHaveBeenCalledWith('mini-player', 'playback-state', state);
    expect(mocks.globalListen).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(state);
  });
});
