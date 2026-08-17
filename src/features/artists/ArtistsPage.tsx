import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { getArtists } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';

export function ArtistsPage({ session }: { session: Session }) {
  const [filter, setFilter] = useState('');
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'artists'],
    queryFn: getArtists,
  });
  const artists = useMemo(
    () =>
      (query.data ?? []).filter((artist) =>
        artist.name.toLowerCase().includes(filter.toLowerCase()),
      ),
    [filter, query.data],
  );
  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">Library</p>
          <h1>Artists</h1>
        </div>
        <label className="inline-search">
          <span className="sr-only">Filter artists</span>
          <input
            type="search"
            placeholder="Filter artists"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </PageHeader>
      {query.isPending ? (
        <div className="state-panel">
          <p>Loading artists…</p>
        </div>
      ) : query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : artists.length === 0 ? (
        <EmptyState title="No artists" detail="No artists match this filter." />
      ) : (
        <div className="artist-grid">
          {artists.map((artist) => (
            <Link
              className="artist-card"
              key={artist.id}
              to={`/artists/${encodeURIComponent(artist.id)}`}
            >
              <span aria-hidden="true">♪</span>
              <strong>{artist.name}</strong>
              <small>{artist.albumCount ?? 0} albums</small>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
