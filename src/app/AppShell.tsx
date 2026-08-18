import { FormEvent, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

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

export function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState(new URLSearchParams(location.search).get('q') ?? '');
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void navigate(`/search${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`);
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
            <span aria-hidden="true">♪</span>
            <div>
              <strong>Pocket Player</strong>
              <small>A Navidrome Revolution</small>
            </div>
          </div>
          <form className="global-search" role="search" onSubmit={submitSearch}>
            <label htmlFor="global-search-input" className="sr-only">
              Search your library
            </label>
            <input
              id="global-search-input"
              type="search"
              value={search}
              placeholder="Search your library…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
          <nav aria-label="Main navigation">
            <NavLink to="/home">Home</NavLink>
            <NavLink to="/albums">Albums</NavLink>
            <NavLink to="/artists">Artists</NavLink>
            <NavLink to="/tracks">Tracks</NavLink>
            <NavLink to="/genres">Genres</NavLink>
            <NavLink to="/tags">Tags</NavLink>
            <NavLink to="/playlists">Playlists</NavLink>
            <NavLink to="/queue">Queue</NavLink>
            <NavLink to="/now-playing">Now Playing</NavLink>
            <NavLink to="/statistics">Statistics</NavLink>
            <NavLink to="/mix">Track Mix</NavLink>
            <NavLink to="/settings">Settings</NavLink>
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
