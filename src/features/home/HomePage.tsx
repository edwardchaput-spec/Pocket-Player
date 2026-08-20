import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlbumGrid } from '../../components/AlbumGrid';
import { EmptyState, ErrorState, LoadingCards, PageHeader } from '../../components/AsyncState';
import { TrackTable } from '../../components/TrackTable';
import {
  AlbumListType,
  getAlbumList,
  getNewestAlbums,
  getPlaylists,
  getStarred,
} from '../../lib/tauri/library';
import { AppError, HomeSection, Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';

const PAGE_SIZE = 24;

export function HomePage({
  session,
  loadAlbums = getNewestAlbums,
  loadAlbumView = getAlbumList,
  loadFavourites = getStarred,
}: {
  session: Session;
  loadAlbums?: typeof getNewestAlbums;
  loadAlbumView?: typeof getAlbumList;
  loadFavourites?: typeof getStarred;
}) {
  const query = useInfiniteQuery({
    queryKey: ['profile', session.profile.profileId, 'albums', 'newest'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => loadAlbums(PAGE_SIZE, pageParam),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    retry: (failureCount, error: AppError) => error.retryable && failureCount < 2,
  });
  const sectionDefinitions: Array<[AlbumListType, HomeSection, string]> = [
    ['recent', 'recent', 'Recently played'],
    ['frequent', 'frequent', 'Frequently played'],
    ['starred', 'starredAlbums', 'Favourite albums'],
    ['random', 'random', 'Random albums'],
  ];
  const sectionQueries = useQueries({
    queries: sectionDefinitions.map(([type]) => ({
      queryKey: ['profile', session.profile.profileId, 'home-albums', type],
      queryFn: () => loadAlbumView(type, 12, 0),
      retry: (count: number, error: AppError) => error.retryable && count < 2,
    })),
  });
  const favourites = useQuery({
    queryKey: ['profile', session.profile.profileId, 'home-favourite-tracks'],
    queryFn: loadFavourites,
  });
  const playback = usePlaybackStore();
  const playlists = useQuery({
    queryKey: ['profile', session.profile.profileId, 'home-playlists'],
    queryFn: getPlaylists,
    enabled:
      playback.homeSections.includes('pinnedPlaylists') && playback.pinnedPlaylistIds.length > 0,
  });
  const albums = query.data?.pages.flat() ?? [];
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
  const sectionOrder = (section: (typeof playback.homeSections)[number]) =>
    playback.homeSections.indexOf(section);

  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">Home</p>
          <h1>Your music</h1>
        </div>
        <p className="muted">The newest albums from your Navidrome library.</p>
      </PageHeader>
      <div className="home-sections">
        {playback.homeSections.includes('newest') && (
          <section className="home-section" style={{ order: sectionOrder('newest') }}>
            <header>
              <h2>Recently added</h2>
              <Link to="/albums">View all</Link>
            </header>
            {query.isPending ? (
              <LoadingCards />
            ) : query.isError ? (
              <ErrorState message={query.error.message} retry={() => void query.refetch()} />
            ) : albums.length === 0 ? (
              <EmptyState
                title="No albums yet"
                detail="Navidrome did not return any recently added albums."
              />
            ) : (
              <>
                <AlbumGrid albums={albums} proxyBaseUrl={session.proxyBaseUrl} />
                {hasNextPage && (
                  <div ref={loadMoreRef} className="infinite-scroll-status" aria-live="polite">
                    {isFetchingNextPage ? 'Loading more albums…' : null}
                  </div>
                )}
              </>
            )}
          </section>
        )}
        {playback.homeSections.includes('trackMix') && (
          <section className="home-mix-card" style={{ order: sectionOrder('trackMix') }}>
            <div>
              <p className="eyebrow">Discovery</p>
              <h2>Track Mix</h2>
              <p>Balance familiar favourites with related, recent, and underplayed music.</p>
            </div>
            <Link className="primary-button" to="/mix">
              Build a mix
            </Link>
          </section>
        )}
        {sectionDefinitions.map(([type, sectionId, title], index) => {
          if (!playback.homeSections.includes(sectionId)) return null;
          const section = sectionQueries[index];
          if (!section) return null;
          return (
            <section key={type} className="home-section" style={{ order: sectionOrder(sectionId) }}>
              <header>
                <h2>{title}</h2>
                <Link to="/albums">View all</Link>
              </header>
              {section.isPending ? (
                <div className="state-panel">
                  <p>Loading {title.toLowerCase()}…</p>
                </div>
              ) : section.isError ? (
                <ErrorState message={section.error.message} retry={() => void section.refetch()} />
              ) : section.data.length ? (
                <AlbumGrid albums={section.data} proxyBaseUrl={session.proxyBaseUrl} />
              ) : (
                <EmptyState
                  title={`No ${title.toLowerCase()}`}
                  detail="Navidrome returned no items for this section."
                />
              )}
            </section>
          );
        })}
        {playback.homeSections.includes('favouriteTracks') && (
          <section className="home-section" style={{ order: sectionOrder('favouriteTracks') }}>
            <header>
              <h2>Favourite tracks</h2>
              <Link to="/tracks">View tracks</Link>
            </header>
            {favourites.isPending ? (
              <div className="state-panel">Loading favourites…</div>
            ) : favourites.isError ? (
              <ErrorState
                message={favourites.error.message}
                retry={() => void favourites.refetch()}
              />
            ) : favourites.data.songs.length ? (
              <TrackTable
                tracks={favourites.data.songs.slice(0, 20)}
                onPlay={(index, displayedTracks) => playback.replaceAndPlay(displayedTracks, index)}
                onPlayNext={(track) => playback.playNext([track])}
                onAddToQueue={(track) => playback.append([track])}
              />
            ) : (
              <EmptyState title="No favourite tracks" detail="Star tracks to see them here." />
            )}
          </section>
        )}
        {playback.homeSections.includes('pinnedPlaylists') && (
          <section className="home-section" style={{ order: sectionOrder('pinnedPlaylists') }}>
            <header>
              <h2>Pinned playlists</h2>
              <Link to="/playlists">View playlists</Link>
            </header>
            {playback.pinnedPlaylistIds.length === 0 ? (
              <EmptyState
                title="No pinned playlists"
                detail="Pin playlists from Settings to keep them close."
              />
            ) : playlists.isPending ? (
              <div className="state-panel">Loading pinned playlists…</div>
            ) : playlists.isError ? (
              <ErrorState
                message={playlists.error.message}
                retry={() => void playlists.refetch()}
              />
            ) : (
              <div className="playlist-link-grid">
                {playlists.data
                  .filter((playlist) => playback.pinnedPlaylistIds.includes(playlist.id))
                  .map((playlist) => (
                    <Link
                      key={playlist.id}
                      className="settings-card"
                      to={`/playlists/${encodeURIComponent(playlist.id)}`}
                    >
                      <strong>{playlist.name}</strong>
                      <span className="muted">{playlist.songCount ?? 0} tracks</span>
                    </Link>
                  ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
