import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { TrackTable } from '../../components/TrackTable';
import { getGenres, queryTracks, refreshLibraryIndex } from '../../lib/tauri/library';
import { AppError, Session, TrackSortField } from '../../lib/tauri/types';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { usePlaybackStore } from '../player/playbackStore';

const PAGE_SIZE = 100;
const SORT_OPTIONS: Array<[TrackSortField, string]> = [
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['album', 'Album'],
  ['year', 'Year'],
  ['genre', 'Genre'],
  ['duration', 'Track length'],
  ['track', 'Track number'],
  ['discNumber', 'Disc number'],
  ['playCount', 'Play count'],
  ['rating', 'Rating'],
  ['starred', 'Favourite'],
  ['bitRate', 'Bit rate'],
  ['bitDepth', 'Bit depth'],
  ['samplingRate', 'Sample rate'],
  ['channelCount', 'Channels'],
  ['size', 'File size'],
  ['suffix', 'File type'],
  ['created', 'Date added'],
  ['bpm', 'BPM'],
];

export function TracksPage({ session }: { session: Session }) {
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const deferredQuery = useDebouncedValue(query);
  const [genre, setGenre] = useState('');
  const [sortBy, setSortBy] = useState<TrackSortField>('title');
  const [descending, setDescending] = useState(false);
  const playback = usePlaybackStore();

  const genres = useQuery({
    queryKey: ['profile', session.profile.profileId, 'genres'],
    queryFn: getGenres,
  });
  const tracks = useInfiniteQuery({
    queryKey: [
      'profile',
      session.profile.profileId,
      'indexed-tracks',
      deferredQuery,
      genre,
      sortBy,
      descending,
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      queryTracks({
        query: deferredQuery,
        genre: genre || undefined,
        sortBy,
        descending,
        offset: pageParam,
        size: PAGE_SIZE,
      }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.tracks.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    retry: (count, error: AppError) => error.retryable && count < 2,
  });
  const refresh = useMutation({
    mutationFn: refreshLibraryIndex,
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ['profile', session.profile.profileId] }),
  });
  const loadedTracks = tracks.data?.pages.flatMap((page) => page.tracks) ?? [];
  const total = tracks.data?.pages[0]?.total ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = tracks;
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
    <main className="page-content library-page">
      <PageHeader>
        <div>
          <p className="eyebrow">Library</p>
          <h1>Tracks</h1>
        </div>
        <div className="index-summary">
          <span>
            {tracks.data?.pages[0]
              ? `${total.toLocaleString()} matches · indexed ${new Date(tracks.data.pages[0].refreshedAt).toLocaleString()}`
              : 'Building the searchable library index…'}
          </span>
          <button
            className="secondary-button"
            type="button"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? 'Refreshing…' : 'Refresh index'}
          </button>
        </div>
      </PageHeader>
      <div className="library-toolbar" role="search">
        <label>
          <span>Search tags</span>
          <input
            type="search"
            value={query}
            placeholder="Title, artist, album, genre, mood, format…"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </label>
        <label>
          <span>Genre</span>
          <select
            value={genre}
            onChange={(event) => {
              setGenre(event.target.value);
            }}
          >
            <option value="">All genres</option>
            {(genres.data ?? []).map((item) => (
              <option key={item.value} value={item.value}>
                {item.value} ({item.songCount ?? 0})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort by</span>
          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as TrackSortField);
            }}
          >
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button sort-direction"
          type="button"
          aria-label={descending ? 'Sort descending' : 'Sort ascending'}
          onClick={() => {
            setDescending((value) => !value);
          }}
        >
          {descending ? 'Descending ↓' : 'Ascending ↑'}
        </button>
      </div>
      {tracks.isPending ? (
        <div className="state-panel">
          <p>Indexing and sorting your tracks…</p>
        </div>
      ) : tracks.isError ? (
        <ErrorState message={tracks.error.message} retry={() => void tracks.refetch()} />
      ) : loadedTracks.length === 0 ? (
        <EmptyState title="No matching tracks" detail="Try changing the search or genre filter." />
      ) : (
        <>
          <TrackTable
            detailed
            tracks={loadedTracks}
            onPlay={(index) => playback.replaceAndPlay(loadedTracks, index)}
            onPlayNext={(track) => playback.playNext([track])}
            onAddToQueue={(track) => playback.append([track])}
          />
          {tracks.hasNextPage && (
            <div ref={loadMoreRef} className="infinite-scroll-status" aria-live="polite">
              {tracks.isFetchingNextPage
                ? 'Loading…'
                : `Scroll for more (${loadedTracks.length.toLocaleString()} of ${total.toLocaleString()})`}
            </div>
          )}
        </>
      )}
    </main>
  );
}
