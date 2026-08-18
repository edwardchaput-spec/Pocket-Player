import { useEffect, useState } from 'react';

import {
  currentDesktopWindow,
  listenPlaybackState,
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
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenPlaybackState(setState).then((dispose) => {
      unlisten = dispose;
      return sendDesktopControl({ action: 'mini-ready' });
    });
    return () => unlisten?.();
  }, []);
  const track = state.track;
  return (
    <main className="mini-player-window">
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
          <div className="mini-window-actions">
            <button
              type="button"
              aria-label={alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
              className={alwaysOnTop ? 'is-active' : ''}
              onClick={() => {
                const next = !alwaysOnTop;
                setAlwaysOnTop(next);
                void currentDesktopWindow().setAlwaysOnTop(next);
              }}
            >
              Pin
            </button>
            <button
              type="button"
              onClick={() => {
                void showMainWindow();
              }}
            >
              Expand
            </button>
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
            aria-label={state.status === 'playing' ? 'Pause' : 'Play'}
            disabled={!track}
            onClick={() => void sendDesktopControl({ action: 'play-pause' })}
          >
            {state.status === 'playing' ? 'Ⅱ' : '▶'}
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
        </div>
      </div>
    </main>
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
