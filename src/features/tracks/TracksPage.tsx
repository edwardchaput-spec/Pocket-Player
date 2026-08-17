import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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
  const [page, setPage] = useState(0);
  const playback = usePlaybackStore();

  const genres = useQuery({
    queryKey: ['profile', session.profile.profileId, 'genres'],
    queryFn: getGenres,
  });
  const tracks = useQuery({
    queryKey: [
      'profile',
      session.profile.profileId,
      'indexed-tracks',
      deferredQuery,
      genre,
      sortBy,
      descending,
      page,
    ],
    queryFn: () =>
      queryTracks({
        query: deferredQuery,
        genre: genre || undefined,
        sortBy,
        descending,
        offset: page * PAGE_SIZE,
        size: PAGE_SIZE,
      }),
    retry: (count, error: AppError) => error.retryable && count < 2,
  });
  const refresh = useMutation({
    mutationFn: refreshLibraryIndex,
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ['profile', session.profile.profileId] }),
  });
  const totalPages = Math.max(1, Math.ceil((tracks.data?.total ?? 0) / PAGE_SIZE));

  return (
    <main className="page-content library-page">
      <PageHeader>
        <div>
          <p className="eyebrow">Library</p>
          <h1>Tracks</h1>
        </div>
        <div className="index-summary">
          <span>
            {tracks.data
              ? `${tracks.data.total.toLocaleString()} matches · indexed ${new Date(tracks.data.refreshedAt).toLocaleString()}`
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
              setPage(0);
            }}
          />
        </label>
        <label>
          <span>Genre</span>
          <select
            value={genre}
            onChange={(event) => {
              setGenre(event.target.value);
              setPage(0);
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
              setPage(0);
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
            setPage(0);
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
      ) : tracks.data.tracks.length === 0 ? (
        <EmptyState title="No matching tracks" detail="Try changing the search or genre filter." />
      ) : (
        <>
          <TrackTable
            detailed
            tracks={tracks.data.tracks}
            onPlay={(index) => playback.replaceAndPlay(tracks.data.tracks, index)}
            onPlayNext={(track) => playback.playNext([track])}
            onAddToQueue={(track) => playback.append([track])}
          />
          <nav className="pagination" aria-label="Track pages">
            <button
              className="secondary-button"
              type="button"
              disabled={page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </main>
  );
}
