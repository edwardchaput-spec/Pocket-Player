import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { Artwork } from '../../components/Artwork';
import { EmptyState, ErrorState } from '../../components/AsyncState';
import { FavoriteButton, RatingControl } from '../../components/LibraryActions';
import { ArtistLink, TagLink } from '../../components/LibraryLinks';
import { TrackTable } from '../../components/TrackTable';
import { formatDuration } from '../../lib/format';
import { getAlbum } from '../../lib/tauri/library';
import { AppError, Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';
import { orderedAlbumTracks } from '../player/queue';

export function AlbumPage({ session }: { session: Session }) {
  const { albumId } = useParams();
  // React Router has already decoded dynamic path segments for useParams().
  const decodedId = albumId ?? '';
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'album', decodedId],
    queryFn: () => getAlbum(decodedId),
    enabled: Boolean(decodedId),
    retry: (failureCount, error: AppError) => error.retryable && failureCount < 2,
  });
  const replaceAndPlay = usePlaybackStore((state) => state.replaceAndPlay);

  if (!decodedId)
    return <EmptyState title="Album not found" detail="The album address is invalid." />;
  if (query.isPending) return <AlbumSkeleton />;
  if (query.isError)
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;

  const album = query.data;
  const tracks = orderedAlbumTracks(album.songs);
  return (
    <main className="page-content album-detail">
      <header className="album-hero">
        <Artwork
          className="album-hero-art"
          proxyBaseUrl={session.proxyBaseUrl}
          coverId={album.coverArt}
          alt={`Cover for ${album.name}`}
          size={520}
        />
        <div>
          <p className="eyebrow">Album</p>
          <h1>{album.name}</h1>
          <p className="album-artist">
            <ArtistLink artistId={album.artistId} name={album.artist} />
          </p>
          <p className="muted">
            {album.year ?? 'Year unknown'}
            {album.genre && (
              <>
                {' · '}
                <TagLink name={album.genre} />
              </>
            )}
            {' · '}
            {album.songCount ? `${album.songCount} songs` : 'Track count unknown'}
            {' · '}
            {formatDuration(album.duration)}
          </p>
          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              disabled={tracks.length === 0}
              onClick={() => replaceAndPlay(tracks)}
            >
              ▶ Play album
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={tracks.length < 2}
              onClick={() => replaceAndPlay(shuffleTracks(tracks))}
            >
              Shuffle
            </button>
            <FavoriteButton
              id={album.id}
              itemType="album"
              starred={album.starred}
              label={album.name}
            />
            <RatingControl id={album.id} value={album.userRating} />
          </div>
        </div>
      </header>
      {tracks.length === 0 ? (
        <EmptyState title="No tracks" detail="Navidrome returned this album without tracks." />
      ) : (
        <TrackTable
          tracks={tracks}
          onPlay={(index, displayedTracks) => replaceAndPlay(displayedTracks, index)}
          onPlayNext={(track) => usePlaybackStore.getState().playNext([track])}
          onAddToQueue={(track) => usePlaybackStore.getState().append([track])}
        />
      )}
    </main>
  );
}

function shuffleTracks<T>(tracks: T[]): T[] {
  const result = [...tracks];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function AlbumSkeleton() {
  return (
    <main className="page-content album-detail" aria-busy="true">
      <div className="album-hero">
        <div className="skeleton album-hero-art" />
        <div>
          <div className="skeleton line" />
          <div className="skeleton line" />
        </div>
      </div>
    </main>
  );
}
