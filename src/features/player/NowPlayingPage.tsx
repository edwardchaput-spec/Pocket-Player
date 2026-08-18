import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { FavoriteButton, RatingControl } from '../../components/LibraryActions';
import { AlbumLink, ArtistLink, TrackTagLinks } from '../../components/LibraryLinks';
import { getLyrics } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';
import { VisualizerStage } from '../visualizer/VisualizerStage';
import { currentQueueItem, usePlaybackStore } from './playbackStore';

export function NowPlayingPage({ session }: { session: Session }) {
  const state = usePlaybackStore();
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
  const selectedLyrics = lyrics.data?.lyrics.find((item) => item.synced) ?? lyrics.data?.lyrics[0];
  const activeLine = selectedLyrics?.synced
    ? activeLyricLine(selectedLyrics.lines, state.position * 1000 + (selectedLyrics.offset ?? 0))
    : -1;
  return (
    <main className="page-content now-playing-page">
      <PageHeader>
        <div>
          <p className="eyebrow">Now playing</p>
          <h1>{track.title}</h1>
          <p className="muted">
            <ArtistLink artistId={track.artistId} name={track.displayArtist ?? track.artist} />
            {' · '}
            <AlbumLink albumId={track.albumId} name={track.album} />
          </p>
          <div className="tag-list now-playing-tags">
            <TrackTagLinks track={track} limit={6} />
          </div>
        </div>
        <div className="button-row">
          <FavoriteButton
            id={track.id}
            itemType="song"
            starred={track.starred}
            label={track.title}
          />
          <RatingControl id={track.id} value={track.userRating} />
          {track.albumId && (
            <Link className="secondary-button" to={`/albums/${encodeURIComponent(track.albumId)}`}>
              Open album
            </Link>
          )}
          {track.artistId && (
            <Link
              className="secondary-button"
              to={`/artists/${encodeURIComponent(track.artistId)}`}
            >
              Open artist
            </Link>
          )}
        </div>
      </PageHeader>
      <div className="now-playing-layout">
        <VisualizerStage session={session} track={track} />
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
