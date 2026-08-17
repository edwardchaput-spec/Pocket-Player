import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { getGenres } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';

export function GenresPage({ session }: { session: Session }) {
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'genres'],
    queryFn: getGenres,
  });
  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">Library</p>
          <h1>Genres</h1>
        </div>
      </PageHeader>
      {query.isPending ? (
        <div className="state-panel">
          <p>Loading genres…</p>
        </div>
      ) : query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState title="No genres" detail="No genre tags were returned." />
      ) : (
        <div className="genre-grid">
          {query.data.map((genre) => (
            <Link
              className="genre-card"
              key={genre.value}
              to={`/genres/${encodeURIComponent(genre.value)}`}
            >
              <strong>{genre.value}</strong>
              <span>
                {genre.songCount?.toLocaleString() ?? 0} tracks ·{' '}
                {genre.albumCount?.toLocaleString() ?? 0} albums
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
