import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { TrackTable } from '../../components/TrackTable';
import { getSongsByGenre } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';

const PAGE_SIZE = 200;
export function GenrePage({ session }: { session: Session }) {
  const { genre = '' } = useParams();
  const playback = usePlaybackStore();
  const query = useInfiniteQuery({
    queryKey: ['profile', session.profile.profileId, 'genre', genre],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getSongsByGenre(genre, PAGE_SIZE, pageParam),
    enabled: Boolean(genre),
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
  });
  const tracks = query.data?.pages.flat() ?? [];
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '480px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">Genre</p>
          <h1>{genre}</h1>
        </div>
        {tracks.length > 0 && (
          <button
            className="primary-button"
            type="button"
            onClick={() => playback.replaceAndPlay(tracks)}
          >
            Play all
          </button>
        )}
      </PageHeader>
      {query.isPending ? (
        <div className="state-panel">
          <p>Loading tracks…</p>
        </div>
      ) : query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : tracks.length === 0 ? (
        <EmptyState title="No tracks" detail="This genre has no visible tracks." />
      ) : (
        <>
          <TrackTable
            detailed
            tracks={tracks}
            onPlay={(index) => playback.replaceAndPlay(tracks, index)}
            onPlayNext={(track) => playback.playNext([track])}
            onAddToQueue={(track) => playback.append([track])}
          />
          {query.hasNextPage && (
            <div ref={loadMoreRef} className="infinite-scroll-status" aria-live="polite">
              {query.isFetchingNextPage ? 'Loading…' : 'Scroll for more'}
            </div>
          )}
        </>
      )}
    </main>
  );
}
