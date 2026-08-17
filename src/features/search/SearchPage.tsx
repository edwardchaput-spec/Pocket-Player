import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AlbumGrid } from '../../components/AlbumGrid';
import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { TrackTable } from '../../components/TrackTable';
import { searchLibrary } from '../../lib/tauri/library';
import { AppError, Session } from '../../lib/tauri/types';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { usePlaybackStore } from '../player/playbackStore';

export function SearchPage({ session }: { session: Session }) {
  const [value, setValue] = useState('');
  const query = useDebouncedValue(value.trim(), 250);
  const playback = usePlaybackStore();
  const results = useQuery({
    queryKey: ['profile', session.profile.profileId, 'search', query],
    queryFn: () => searchLibrary(query),
    enabled: query.length > 0,
    retry: (count, error: AppError) => error.retryable && count < 2,
  });
  const empty =
    results.data &&
    results.data.artists.length + results.data.albums.length + results.data.songs.length === 0;
  return (
    <main className="page-content search-page">
      <PageHeader>
        <div>
          <p className="eyebrow">Library</p>
          <h1>Search</h1>
        </div>
      </PageHeader>
      <label className="search-box">
        <span className="sr-only">Search artists, albums, and tracks</span>
        <input
          autoFocus
          type="search"
          value={value}
          placeholder="Search artists, albums, and tracks"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      {!query ? (
        <EmptyState title="Search your library" detail="Results appear after you start typing." />
      ) : results.isPending ? (
        <div className="state-panel">
          <p>Searching…</p>
        </div>
      ) : results.isError ? (
        <ErrorState message={results.error.message} retry={() => void results.refetch()} />
      ) : empty ? (
        <EmptyState title="No results" detail={`Nothing matched “${query}”.`} />
      ) : results.data ? (
        <div className="search-groups">
          {results.data.artists.length > 0 && (
            <section>
              <h2>Artists</h2>
              <div className="artist-grid">
                {results.data.artists.map((artist) => (
                  <Link
                    key={artist.id}
                    to={`/artists/${encodeURIComponent(artist.id)}`}
                    className="artist-card"
                  >
                    <span aria-hidden="true">♪</span>
                    <strong>{artist.name}</strong>
                    <small>{artist.albumCount ?? 0} albums</small>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {results.data.albums.length > 0 && (
            <section>
              <h2>Albums</h2>
              <AlbumGrid albums={results.data.albums} proxyBaseUrl={session.proxyBaseUrl} />
            </section>
          )}
          {results.data.songs.length > 0 && (
            <section>
              <h2>Tracks</h2>
              <TrackTable
                tracks={results.data.songs}
                onPlay={(index) => playback.replaceAndPlay(results.data.songs, index)}
                onPlayNext={(track) => playback.playNext([track])}
                onAddToQueue={(track) => playback.append([track])}
              />
            </section>
          )}
        </div>
      ) : null}
    </main>
  );
}
