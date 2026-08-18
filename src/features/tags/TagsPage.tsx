import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { getTags } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';

export function TagsPage({ session }: { session: Session }) {
  const [filter, setFilter] = useState('');
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'tags'],
    queryFn: getTags,
  });
  const tags = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return (query.data ?? []).filter(
      (tag) =>
        !needle ||
        tag.name.toLocaleLowerCase().includes(needle) ||
        tag.categories.some((category) => category.toLocaleLowerCase().includes(needle)),
    );
  }, [filter, query.data]);

  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">Library index</p>
          <h1>Tags</h1>
        </div>
        <label className="inline-search">
          <span className="sr-only">Filter tags</span>
          <input
            type="search"
            placeholder="Filter genres and moods"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </PageHeader>
      {query.isPending ? (
        <div className="state-panel">
          <p>Indexing tags…</p>
        </div>
      ) : query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : tags.length === 0 ? (
        <EmptyState
          title="No tags"
          detail={filter ? 'No tags match this filter.' : 'No genre or mood tags were indexed.'}
        />
      ) : (
        <div className="genre-grid tag-catalogue">
          {tags.map((tag) => (
            <Link
              className="genre-card"
              key={tag.name.toLocaleLowerCase()}
              to={`/tags/${encodeURIComponent(tag.name)}`}
            >
              <strong>{tag.name}</strong>
              <span>{tag.categories.join(' · ')}</span>
              <small>
                {tag.songCount.toLocaleString()} tracks · {tag.albumCount.toLocaleString()} albums
              </small>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
