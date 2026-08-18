import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { TrackTable } from '../../components/TrackTable';
import { queryTracks } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';

const PAGE_SIZE = 200;

export function TagPage({ session }: { session: Session }) {
  const { tag = '' } = useParams();
  const playback = usePlaybackStore();
  const query = useInfiniteQuery({
    queryKey: ['profile', session.profile.profileId, 'tag', tag],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      queryTracks({
        query: '',
        tag,
        sortBy: 'album',
        descending: false,
        offset: pageParam,
        size: PAGE_SIZE,
      }),
    enabled: Boolean(tag),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.tracks.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const tracks = query.data?.pages.flatMap((page) => page.tracks) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      () => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
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
          <p className="eyebrow">Tag</p>
          <h1>{tag}</h1>
          {total > 0 && <p className="muted">{total.toLocaleString()} matching tracks</p>}
        </div>
        {tracks.length > 0 && (
          <button
            className="primary-button"
            type="button"
            onClick={() => playback.replaceAndPlay(tracks)}
          >
            Play loaded tracks
          </button>
        )}
      </PageHeader>
      {query.isPending ? (
        <div className="state-panel">
          <p>Loading tagged tracks…</p>
        </div>
      ) : query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : tracks.length === 0 ? (
        <EmptyState title="No tracks" detail="No indexed tracks use this tag." />
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
