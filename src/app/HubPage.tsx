import { Link } from 'react-router-dom';

export interface HubLink {
  to: string;
  label: string;
  description: string;
}

export const LIBRARY_HUB_LINKS: readonly HubLink[] = [
  { to: '/albums', label: 'Albums', description: 'Every album, newest first' },
  { to: '/artists', label: 'Artists', description: 'Browse by artist' },
  { to: '/tracks', label: 'Tracks', description: 'The full sortable track index' },
  { to: '/genres', label: 'Genres', description: 'Library grouped by genre' },
  { to: '/tags', label: 'Tags', description: 'Genres and moods from your tags' },
];

export const MORE_HUB_LINKS: readonly HubLink[] = [
  { to: '/now-playing', label: 'Now Playing', description: 'Visualisers and lyrics' },
  { to: '/queue', label: 'Queue', description: 'Reorder what plays next' },
  { to: '/mix', label: 'Track Mix', description: 'Build an explainable mix' },
  { to: '/statistics', label: 'Statistics', description: 'Listening on this device' },
  { to: '/settings', label: 'Settings', description: 'Account, playback, and theme' },
];

/**
 * Compact-width hub that keeps every destination reachable from the
 * five-item bottom navigation (ADR-010).
 */
export function HubPage({ title, links }: { title: string; links: readonly HubLink[] }) {
  return (
    <main className="page-content hub-page">
      <header className="page-header">
        <h1>{title}</h1>
      </header>
      <ul className="hub-list">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to}>
              <strong>{link.label}</strong>
              <small>{link.description}</small>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
