import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Artwork } from '../../components/Artwork';
import { EmptyState, ErrorState } from '../../components/AsyncState';
import { FavoriteButton, RatingControl } from '../../components/LibraryActions';
import { AlbumLink, ArtistLink, TrackTagLinks } from '../../components/LibraryLinks';
import { formatDuration } from '../../lib/format';
import { getLyrics } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';
import { currentQueueItem, usePlaybackStore } from './playbackStore';
import { usePlaybackTransport } from './transportContext';

/**
 * Full-page Now Playing: artwork, transport, rating and lyrics. The
 * visualiser lives on its own page (`/visualizer`).
 */
export function NowPlayingPage({ session }: { session: Session }) {
  const state = usePlaybackStore();
  const transport = usePlaybackTransport();
  const current = currentQueueItem(state);
  const lyrics = useQuery({
    queryKey: ['profile', session.profile.profileId, 'lyrics', current?.track.id],
    queryFn: () => getLyrics(current!.track.id),
    enabled: Boolean(current),
    retry: false,
  });
  if (!current)
    return (
      <main className="page-content">
        <EmptyState
          title="Nothing playing"
          detail="Choose a track from your library to open Now Playing."
        />
      </main>
    );
  const track = current.track;
  const playbackActive =
    state.status === 'loading' || state.status === 'playing' || state.status === 'stalled';
  const duration = state.duration || track.duration || 0;
  const position = Math.min(state.position, duration || state.position);
  const upNext = state.currentIndex == null ? undefined : state.queue[state.currentIndex + 1];
  const selectedLyrics = lyrics.data?.lyrics.find((item) => item.synced) ?? lyrics.data?.lyrics[0];
  const activeLine = selectedLyrics?.synced
    ? activeLyricLine(selectedLyrics.lines, state.position * 1000 + (selectedLyrics.offset ?? 0))
    : -1;
  return (
    <main className="page-content now-playing-page">
      <div className="now-playing-layout">
        <section className="now-playing-hero" aria-label="Now playing">
          <div className="now-playing-cover">
            <Artwork
              proxyBaseUrl={session.proxyBaseUrl}
              coverId={track.coverArt}
              alt={track.album ? `${track.album} cover` : ''}
              size={900}
            />
          </div>
          <div className="now-playing-meta">
            <p className="eyebrow">Now playing</p>
            <h1>{track.title}</h1>
            <p className="muted">
              <ArtistLink artistId={track.artistId} name={track.displayArtist ?? track.artist} />
              {' · '}
              <AlbumLink albumId={track.albumId} name={track.album} />
            </p>
          </div>
          <div className="now-playing-progress">
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={Math.max(duration, 0)}
              step={0.1}
              value={position}
              onChange={(event) => transport.seek(Number(event.target.value))}
            />
            <div>
              <span>{formatDuration(position)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>
          <div className="now-playing-transport">
            <button
              type="button"
              className={state.shuffleMode ? 'is-active' : ''}
              aria-label={state.shuffleMode ? 'Disable shuffle' : 'Enable shuffle'}
              aria-pressed={state.shuffleMode}
              onClick={() => state.toggleShuffle()}
            >
              ⤨
            </button>
            <button type="button" aria-label="Previous track" onClick={() => state.previous()}>
              ⏮
            </button>
            <button
              type="button"
              className="now-playing-play"
              aria-label={playbackActive ? 'Pause' : 'Play'}
              onClick={() => (playbackActive ? transport.pause() : transport.play())}
            >
              {playbackActive ? 'Ⅱ' : '▶'}
            </button>
            <button type="button" aria-label="Next track" onClick={() => state.next('manual')}>
              ⏭
            </button>
            <button
              type="button"
              className={state.repeatMode !== 'off' ? 'is-active' : ''}
              aria-label={`Repeat ${state.repeatMode}`}
              onClick={() => state.cycleRepeat()}
            >
              {state.repeatMode === 'one' ? '↻1' : '↻'}
            </button>
          </div>
          <div className="now-playing-actions">
            <FavoriteButton
              id={track.id}
              itemType="song"
              starred={track.starred}
              label={track.title}
            />
            <RatingControl id={track.id} value={track.userRating} />
            <Link className="secondary-button" to="/visualizer">
              Visualiser
            </Link>
            <Link className="secondary-button" to="/queue">
              Queue
            </Link>
          </div>
          <div className="tag-list now-playing-tags">
            <TrackTagLinks track={track} limit={6} />
          </div>
          {upNext && (
            <p className="now-playing-next muted">
              Up next: <strong>{upNext.track.title}</strong>
              {upNext.track.artist ? ` · ${upNext.track.artist}` : ''}
            </p>
          )}
        </section>
        <section className="lyrics-panel">
          <header>
            <h2>Lyrics</h2>
            {selectedLyrics?.lang && <span>{selectedLyrics.lang}</span>}
          </header>
          {lyrics.isPending ? (
            <p className="muted">Loading lyrics…</p>
          ) : lyrics.isError ? (
            <ErrorState message={lyrics.error.message} retry={() => void lyrics.refetch()} />
          ) : !selectedLyrics?.lines.length ? (
            <EmptyState
              title="No lyrics"
              detail="Navidrome did not return approved lyrics for this track."
            />
          ) : (
            <div className={selectedLyrics.synced ? 'synced-lyrics' : 'plain-lyrics'}>
              {selectedLyrics.lines.map((line, index) => (
                <p
                  key={`${line.start ?? index}-${index}`}
                  className={index === activeLine ? 'is-active' : ''}
                >
                  {line.value || '♪'}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function activeLyricLine(
  lines: Array<{ start?: number | null | undefined; value: string }>,
  positionMs: number,
): number {
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index]?.start;
    if (start != null && start <= positionMs) active = index;
    else if (start != null && start > positionMs) break;
  }
  return active;
}
