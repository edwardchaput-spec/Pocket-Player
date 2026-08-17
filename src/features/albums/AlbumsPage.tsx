import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AlbumGrid } from '../../components/AlbumGrid';
import { EmptyState, ErrorState, LoadingCards, PageHeader } from '../../components/AsyncState';
import { AlbumListType, getAlbumList } from '../../lib/tauri/library';
import { AppError, Session } from '../../lib/tauri/types';

const PAGE_SIZE = 48;
const VIEWS: Array<[AlbumListType, string]> = [
  ['alphabeticalByName', 'A–Z'],
  ['alphabeticalByArtist', 'Artist'],
  ['newest', 'Recently added'],
  ['recent', 'Recently played'],
  ['frequent', 'Frequently played'],
  ['highest', 'Highest rated'],
  ['starred', 'Favourites'],
  ['random', 'Random'],
];

export function AlbumsPage({ session }: { session: Session }) {
  const [view, setView] = useState<AlbumListType>('alphabeticalByName');
  const query = useInfiniteQuery({
    queryKey: ['profile', session.profile.profileId, 'albums', view],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getAlbumList(view, PAGE_SIZE, pageParam),
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    retry: (count, error: AppError) => error.retryable && count < 2,
  });
  const albums = query.data?.pages.flat() ?? [];
  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">Library</p>
          <h1>Albums</h1>
        </div>
        <label className="inline-select">
          <span>View</span>
          <select value={view} onChange={(event) => setView(event.target.value as AlbumListType)}>
            {VIEWS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>
      {query.isPending ? (
        <LoadingCards />
      ) : query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : albums.length === 0 ? (
        <EmptyState title="No albums" detail="This album view is empty." />
      ) : (
        <>
          <AlbumGrid albums={albums} proxyBaseUrl={session.proxyBaseUrl} />
          {query.hasNextPage && (
            <div className="load-more">
              <button
                className="secondary-button"
                type="button"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
