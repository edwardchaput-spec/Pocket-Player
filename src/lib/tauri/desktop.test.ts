import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(() => Promise.resolve()),
  emitTo: vi.fn(() => Promise.resolve()),
  globalListen: vi.fn(() => Promise.resolve(() => undefined)),
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
  WebviewWindow: {
    getCurrent: () => ({ listen: mocks.windowListen }),
    getByLabel: vi.fn(() => Promise.resolve(null)),
  },
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main' }),
}));

import { DesktopControl, listenDesktopControl, sendDesktopControl } from './desktop';

describe('desktop playback controls', () => {
  beforeEach(() => vi.clearAllMocks());

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
});
