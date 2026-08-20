import { useEffect, useState } from 'react';

import {
  currentDesktopWindow,
  isMainWindowVisible,
  listenPlaybackState,
  requestPlaybackState,
  sendDesktopControl,
  showMainWindow,
  SharedPlaybackState,
} from '../../lib/tauri/desktop';

const EMPTY: SharedPlaybackState = {
  track: null,
  artworkUrl: null,
  status: 'idle',
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  queueLength: 0,
  currentIndex: null,
};

export function MiniPlayerWindow() {
  const [state, setState] = useState(EMPTY);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [mainWindowVisible, setMainWindowVisible] = useState(true);
  useEffect(() => {
    let disposed = false;
    let receivedState = false;
    let unlisten: (() => void) | undefined;
    const retryTimers: number[] = [];
    const requestState = () => {
      if (!disposed) void requestPlaybackState().catch(() => undefined);
    };
    const requestWhenVisible = () => {
      if (document.visibilityState !== 'hidden') requestState();
    };

    void listenPlaybackState((nextState) => {
      if (disposed) return;
      receivedState = true;
      setState(nextState);
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
        for (const delay of [0, 150, 600, 1500]) {
          retryTimers.push(
            window.setTimeout(() => {
              if (!receivedState) requestState();
            }, delay),
          );
        }
      })
      .catch(() => undefined);

    window.addEventListener('focus', requestState);
    document.addEventListener('visibilitychange', requestWhenVisible);
    return () => {
      disposed = true;
      for (const timer of retryTimers) window.clearTimeout(timer);
      window.removeEventListener('focus', requestState);
      document.removeEventListener('visibilitychange', requestWhenVisible);
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const update = () => {
      void isMainWindowVisible()
        .then((visible) => {
          if (active) setMainWindowVisible(visible);
        })
        .catch(() => undefined);
    };
    update();
    const timer = window.setInterval(update, 750);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  const track = state.track;
  return (
    <main className="mini-player-window">
      <div className="mini-edge-detail" aria-hidden="true" />
      <header className="mini-titlebar" data-tauri-drag-region>
        <div className="mini-drag-rail" data-tauri-drag-region>
          <span data-tauri-drag-region />
          <small data-tauri-drag-region>POCKET / PLAYING</small>
        </div>
        <div className="mini-window-actions">
          <button
            type="button"
            aria-label={alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
            aria-pressed={alwaysOnTop}
            className={alwaysOnTop ? 'is-active' : ''}
            title={alwaysOnTop ? 'Unpin window' : 'Pin window'}
            onClick={() => {
              const next = !alwaysOnTop;
              setAlwaysOnTop(next);
              void currentDesktopWindow().setAlwaysOnTop(next);
            }}
          >
            <MiniIcon name="pin" />
          </button>
          <button
            type="button"
            aria-label="Show main window"
            disabled={mainWindowVisible}
            title={mainWindowVisible ? 'The main window is already open' : 'Show the main window'}
            onClick={() => {
              void showMainWindow().then(() => setMainWindowVisible(true));
            }}
          >
            <MiniIcon name="extend" />
          </button>
          <span className="mini-action-divider" aria-hidden="true" />
          <button
            type="button"
            aria-label="Minimize mini player"
            title="Minimize"
            onClick={() => void currentDesktopWindow().minimize()}
          >
            <MiniIcon name="minimize" />
          </button>
          <button
            type="button"
            className="mini-close"
            aria-label="Close mini player"
            title="Close mini player"
            onClick={() => void currentDesktopWindow().close()}
          >
            <MiniIcon name="close" />
          </button>
        </div>
      </header>
      <div className="mini-art">
        {state.artworkUrl ? (
          <img src={state.artworkUrl} alt="" />
        ) : (
          <span aria-hidden="true">♪</span>
        )}
      </div>
      <div className="mini-content">
        <div className="mini-title">
          <div>
            <strong>{track?.title ?? 'Nothing playing'}</strong>
            {track ? (
              <span className="mini-metadata-links">
                <MiniLibraryLink
                  id={track.artistId}
                  label={track.displayArtist ?? track.artist ?? 'Unknown artist'}
                  route="artists"
                />
                {' · '}
                <MiniLibraryLink
                  id={track.albumId}
                  label={track.album ?? 'Unknown album'}
                  route="albums"
                />
              </span>
            ) : (
              <span>Choose music in the main window</span>
            )}
          </div>
        </div>
        <div className="mini-controls">
          <button
            type="button"
            aria-label="Previous"
            disabled={!track}
            onClick={() => void sendDesktopControl({ action: 'previous' })}
          >
            ⏮
          </button>
          <button
            className="mini-play"
            type="button"
            aria-label={isPlaybackActive(state.status) ? 'Pause' : 'Play'}
            disabled={!track}
            onClick={() =>
              void sendDesktopControl({
                action: isPlaybackActive(state.status) ? 'pause' : 'play',
              })
            }
          >
            {isPlaybackActive(state.status) ? 'Ⅱ' : '▶'}
          </button>
          <button
            type="button"
            aria-label="Next"
            disabled={!track}
            onClick={() => void sendDesktopControl({ action: 'next' })}
          >
            ⏭
          </button>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={Math.max(0, state.duration)}
            step={0.1}
            value={Math.min(state.position, state.duration || 0)}
            disabled={!track}
            onChange={(event) =>
              void sendDesktopControl({ action: 'seek', value: Number(event.target.value) })
            }
          />
          <span>
            {clock(state.position)} / {clock(state.duration)}
          </span>
          <button
            type="button"
            aria-label={state.muted ? 'Unmute' : 'Mute'}
            disabled={!track}
            onClick={() => void sendDesktopControl({ action: 'mute', muted: !state.muted })}
          >
            {state.muted ? '🔇' : '🔊'}
          </button>
          <input
            className="mini-volume"
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            disabled={!track}
            onChange={(event) =>
              void sendDesktopControl({ action: 'volume', value: Number(event.target.value) })
            }
          />
        </div>
      </div>
    </main>
  );
}

function isPlaybackActive(status: SharedPlaybackState['status']): boolean {
  return status === 'loading' || status === 'playing' || status === 'stalled';
}

function MiniIcon({ name }: { name: 'pin' | 'extend' | 'minimize' | 'close' }) {
  if (name === 'pin') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m9 4 6 0-1 5 3 3-5 1-1 7-1-7-4-1 4-3-1-5Z" />
      </svg>
    );
  }
  if (name === 'extend') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M9 5H5v4M15 5h4v4M9 19H5v-4M15 19h4v-4" />
      </svg>
    );
  }
  if (name === 'minimize') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6 15h12" />
        <path className="mini-icon-accent" d="M17 12.5 19.5 15 17 17.5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m7 7 10 10M17 7 7 17" />
      <circle className="mini-icon-accent" cx="18.5" cy="5.5" r="1" />
    </svg>
  );
}

function MiniLibraryLink({
  id,
  label,
  route,
}: {
  id?: string | null | undefined;
  label: string;
  route: 'artists' | 'albums';
}) {
  if (!id) return <>{label}</>;
  return (
    <button
      type="button"
      onClick={() =>
        void sendDesktopControl({
          action: 'navigate-main',
          route: `/${route}/${encodeURIComponent(id)}`,
        })
      }
    >
      {label}
    </button>
  );
}

function clock(value: number): string {
  if (!Number.isFinite(value)) return '0:00';
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
