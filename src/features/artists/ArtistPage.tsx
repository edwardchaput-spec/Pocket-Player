import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { AlbumGrid } from '../../components/AlbumGrid';
import { EmptyState, ErrorState } from '../../components/AsyncState';
import { FavoriteButton, RatingControl } from '../../components/LibraryActions';
import { getArtist, getArtistSongs } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';

type ArtistPlaybackAction = 'play' | 'shuffle';
interface ArtistPlaybackRequest {
  action: ArtistPlaybackAction;
  artistId: string;
}

export function ArtistPage({ session }: { session: Session }) {
  const { artistId = '' } = useParams();
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'artist', artistId],
    queryFn: () => getArtist(artistId),
    enabled: Boolean(artistId),
  });
  const playback = usePlaybackStore();
  const loadSongs = useMutation({
    mutationFn: ({ artistId: requestedArtistId }: ArtistPlaybackRequest) =>
      getArtistSongs(requestedArtistId),
    onSuccess: (songs, request) => {
      if (songs.length === 0) return;
      if (request.action === 'shuffle') playback.shuffleAndPlay(songs);
      else playback.replaceAndPlay(songs);
    },
  });
  if (!artistId)
    return <EmptyState title="Artist not found" detail="The artist address is invalid." />;
  if (query.isPending)
    return (
      <main className="page-content">
        <div className="state-panel">Loading artist…</div>
      </main>
    );
  if (query.isError)
    return (
      <main className="page-content">
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      </main>
    );
  const artist = query.data;
  return (
    <main className="page-content">
      <header className="detail-heading">
        <div>
          <p className="eyebrow">Artist</p>
          <h1>{artist.name}</h1>
          <p className="muted">{artist.albumCount ?? artist.albums.length} albums</p>
        </div>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            disabled={artist.albums.length === 0 || loadSongs.isPending}
            onClick={() => loadSongs.mutate({ action: 'play', artistId })}
          >
            {loadSongs.isPending && loadSongs.variables.action === 'play'
              ? 'Loading tracks…'
              : '▶ Play all'}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={artist.albums.length === 0 || loadSongs.isPending}
            onClick={() => loadSongs.mutate({ action: 'shuffle', artistId })}
          >
            {loadSongs.isPending && loadSongs.variables.action === 'shuffle'
              ? 'Loading tracks…'
              : 'Shuffle all'}
          </button>
          <FavoriteButton
            id={artist.id}
            itemType="artist"
            starred={artist.starred}
            label={artist.name}
          />
          <RatingControl id={artist.id} value={artist.userRating} />
        </div>
      </header>
      {loadSongs.isError && (
        <p className="message error-message" role="alert">
          Could not load every track for {artist.name}. {loadSongs.error.message}
        </p>
      )}
      {loadSongs.isSuccess && loadSongs.data.length === 0 && (
        <p className="message" role="status">
          Navidrome returned no playable tracks for {artist.name}.
        </p>
      )}
      {artist.albums.length ? (
        <AlbumGrid albums={artist.albums} proxyBaseUrl={session.proxyBaseUrl} />
      ) : (
        <EmptyState title="No albums" detail="Navidrome returned no albums for this artist." />
      )}
    </main>
  );
}
