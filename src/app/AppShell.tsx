import { FormEvent, useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { BrandMark } from '../components/BrandMark';
import { Session } from '../lib/tauri/types';
import { AlbumPage } from '../features/albums/AlbumPage';
import { AlbumsPage } from '../features/albums/AlbumsPage';
import { ArtistPage } from '../features/artists/ArtistPage';
import { ArtistsPage } from '../features/artists/ArtistsPage';
import { GenrePage } from '../features/genres/GenrePage';
import { GenresPage } from '../features/genres/GenresPage';
import { HomePage } from '../features/home/HomePage';
import { MixPage } from '../features/mix/MixPage';
import { PlayerProvider } from '../features/player/PlayerProvider';
import { NowPlayingPage } from '../features/player/NowPlayingPage';
import { PlaylistPage } from '../features/playlists/PlaylistPage';
import { PlaylistsPage } from '../features/playlists/PlaylistsPage';
import { QueuePage } from '../features/queue/QueuePage';
import { SearchPage } from '../features/search/SearchPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { StatisticsPage } from '../features/statistics/StatisticsPage';
import { TracksPage } from '../features/tracks/TracksPage';
import { TagPage } from '../features/tags/TagPage';
import { TagsPage } from '../features/tags/TagsPage';

const NAV_ITEMS = [
  { to: '/home', label: 'Home', glyph: '◇' },
  { to: '/albums', label: 'Albums', glyph: '▣' },
  { to: '/artists', label: 'Artists', glyph: '◎' },
  { to: '/tracks', label: 'Tracks', glyph: '≋' },
  { to: '/genres', label: 'Genres', glyph: '⌁' },
  { to: '/tags', label: 'Tags', glyph: '⌗' },
  { to: '/playlists', label: 'Playlists', glyph: '≡' },
  { to: '/queue', label: 'Queue', glyph: '↥' },
  { to: '/now-playing', label: 'Now Playing', glyph: '▶' },
  { to: '/statistics', label: 'Statistics', glyph: '∿' },
  { to: '/mix', label: 'Track Mix', glyph: '✦' },
  { to: '/settings', label: 'Settings', glyph: '⌘' },
] as const;

export function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState(new URLSearchParams(location.search).get('q') ?? '');
  const searchInput = useRef<HTMLInputElement>(null);
  const routeSearch = new URLSearchParams(location.search).get('q') ?? '';
  const searchValue = location.pathname === '/search' ? routeSearch : search;

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      } else if (!isTyping && event.key === '/') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const showSearchResults = (value: string, replace = location.pathname === '/search') => {
    const query = value.trim();
    void navigate(`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`, { replace });
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    showSearchResults(searchValue);
  };
  let host = session.profile.serverUrl;
  try {
    host = new URL(session.profile.serverUrl).host;
  } catch {
    /* URL was validated by Rust. */
  }
  return (
    <PlayerProvider session={session}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="app-brand">
            <span aria-hidden="true">
              <BrandMark />
            </span>
            <div>
              <strong>Pocket Player</strong>
              <small>A Navidrome Revolution</small>
            </div>
          </div>
          <nav aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} aria-label={item.label} title={item.label}>
                <span className="nav-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="connection-indicator">
            <span aria-hidden="true" />
            <div>
              <small>Connected</small>
              <strong>{host}</strong>
            </div>
          </div>
        </aside>
        <div className="route-content">
          <header className="workspace-header">
            <div className="workspace-context" aria-hidden="true">
              <span>Library</span>
              <strong>{routeTitle(location.pathname)}</strong>
            </div>
            <form className="global-search" role="search" onSubmit={submitSearch}>
              <label htmlFor="global-search-input" className="sr-only">
                Search artists, albums, and tracks
              </label>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                ref={searchInput}
                id="global-search-input"
                type="search"
                value={searchValue}
                placeholder="Search artists, albums, tracks…"
                aria-keyshortcuts="Control+K Meta+K /"
                onChange={(event) => {
                  const next = event.target.value;
                  setSearch(next);
                  showSearchResults(next);
                }}
              />
              {searchValue ? (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch('');
                    if (location.pathname === '/search') showSearchResults('', true);
                    searchInput.current?.focus();
                  }}
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
            </form>
          </header>
          <Routes>
            <Route path="/home" element={<HomePage session={session} />} />
            <Route path="/search" element={<SearchPage session={session} />} />
            <Route path="/albums" element={<AlbumsPage session={session} />} />
            <Route path="/albums/:albumId" element={<AlbumPage session={session} />} />
            <Route path="/artists" element={<ArtistsPage session={session} />} />
            <Route path="/artists/:artistId" element={<ArtistPage session={session} />} />
            <Route path="/tracks" element={<TracksPage session={session} />} />
            <Route path="/genres" element={<GenresPage session={session} />} />
            <Route path="/genres/:genre" element={<GenrePage session={session} />} />
            <Route path="/tags" element={<TagsPage session={session} />} />
            <Route path="/tags/:tag" element={<TagPage session={session} />} />
            <Route path="/playlists" element={<PlaylistsPage session={session} />} />
            <Route path="/playlists/:playlistId" element={<PlaylistPage session={session} />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/now-playing" element={<NowPlayingPage session={session} />} />
            <Route path="/statistics" element={<StatisticsPage session={session} />} />
            <Route path="/mix" element={<MixPage session={session} />} />
            <Route
              path="/settings"
              element={<SettingsPage session={session} onLogout={onLogout} />}
            />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </div>
    </PlayerProvider>
  );
}

function routeTitle(pathname: string): string {
  if (pathname.startsWith('/albums/')) return 'Album';
  if (pathname.startsWith('/artists/')) return 'Artist';
  if (pathname.startsWith('/genres/')) return 'Genre';
  if (pathname.startsWith('/tags/')) return 'Tag';
  if (pathname.startsWith('/playlists/')) return 'Playlist';
  const titles: Record<string, string> = {
    '/home': 'Home',
    '/search': 'Search',
    '/albums': 'Albums',
    '/artists': 'Artists',
    '/tracks': 'Tracks',
    '/genres': 'Genres',
    '/tags': 'Tags',
    '/playlists': 'Playlists',
    '/queue': 'Queue',
    '/now-playing': 'Now Playing',
    '/statistics': 'Statistics',
    '/mix': 'Track Mix',
    '/settings': 'Settings',
  };
  return titles[pathname] ?? 'Home';
}
