import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { AlbumGrid } from '../../components/AlbumGrid';
import { EmptyState, ErrorState } from '../../components/AsyncState';
import { FavoriteButton, RatingControl } from '../../components/LibraryActions';
import { getArtist } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';

export function ArtistPage({ session }: { session: Session }) {
  const { artistId = '' } = useParams();
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'artist', artistId],
    queryFn: () => getArtist(artistId),
    enabled: Boolean(artistId),
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
          <FavoriteButton
            id={artist.id}
            itemType="artist"
            starred={artist.starred}
            label={artist.name}
          />
          <RatingControl id={artist.id} value={artist.userRating} />
        </div>
      </header>
      {artist.albums.length ? (
        <AlbumGrid albums={artist.albums} proxyBaseUrl={session.proxyBaseUrl} />
      ) : (
        <EmptyState title="No albums" detail="Navidrome returned no albums for this artist." />
      )}
    </main>
  );
}
