import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

import { getNewestAlbums, searchLibrary } from '../lib/tauri/library';
import { sessionFixture, songsFixture } from '../test/fixtures';
import { usePlaybackStore } from '../features/player/playbackStore';
import { AppShell, parentRoute } from './AppShell';

vi.mock('../lib/tauri/library', () => ({
  getNewestAlbums: vi.fn(),
  getAlbum: vi.fn(),
  getAlbumList: vi.fn(() => Promise.resolve([])),
  getPlaylists: vi.fn(() => Promise.resolve([])),
  getLibraryIndexStatus: vi.fn(() => Promise.resolve({ ready: false, trackCount: 0 })),
  refreshLibraryIndex: vi.fn(() => Promise.resolve({ ready: true, trackCount: 0 })),
  getStarred: vi.fn(() => Promise.resolve({ artists: [], albums: [], songs: [] })),
  searchLibrary: vi.fn(() => Promise.resolve({ artists: [], albums: [], songs: [] })),
  getLyrics: vi.fn(() => Promise.resolve({ lyrics: [] })),
}));
vi.mock('../lib/tauri/playback', () => ({
  recordPlaybackEvent: vi.fn(() => Promise.resolve()),
  reportScrobble: vi.fn(() => Promise.resolve(true)),
  savePlayerSettings: vi.fn(() => Promise.resolve()),
  saveQueueSnapshot: vi.fn(() => Promise.resolve()),
  syncPlayQueue: vi.fn(() => Promise.resolve()),
}));
vi.mock('../lib/tauri/desktop', () => ({
  currentDesktopWindow: vi.fn(() => ({
    hide: vi.fn(() => Promise.resolve()),
    onCloseRequested: vi.fn(() => Promise.resolve(() => undefined)),
    setFocus: vi.fn(() => Promise.resolve()),
    show: vi.fn(() => Promise.resolve()),
  })),
  emitPlaybackState: vi.fn(() => Promise.resolve()),
  listenDesktopControl: vi.fn(() => Promise.resolve(() => undefined)),
  openMiniPlayer: vi.fn(() => Promise.resolve()),
  showTrackNotification: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  vi.mocked(getNewestAlbums).mockResolvedValue([]);
  vi.mocked(searchLibrary).mockResolvedValue({ artists: [], albums: [], songs: [] });
  usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
  usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
});

it('keeps one integrated search field in the workspace header', () => {
  renderShell('/home');

  const search = screen.getByRole('searchbox', {
    name: 'Search artists, albums, and tracks',
  });
  expect(screen.getAllByRole('searchbox')).toHaveLength(1);
  expect(search.closest('.workspace-header')).not.toBeNull();
  expect(document.querySelector('.sidebar [role="search"]')).toBeNull();
});

it('shows debounced library results from the persistent search field', async () => {
  vi.mocked(searchLibrary).mockResolvedValue({
    artists: [],
    albums: [],
    songs: songsFixture,
  });
  renderShell('/home');

  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Search artists, albums, and tracks' }),
    'signal',
  );

  expect(await screen.findByRole('heading', { name: 'Search results' })).toBeInTheDocument();
  await waitFor(() => expect(searchLibrary).toHaveBeenCalledWith('signal'));
  expect((await screen.findAllByText(songsFixture[0]!.title)).length).toBeGreaterThan(0);
});

it('keeps typed spaces in multi-word searches', async () => {
  renderShell('/home');
  const search = screen.getByRole('searchbox', { name: 'Search artists, albums, and tracks' });

  await userEvent.type(search, 'dark side');

  expect(search).toHaveValue('dark side');
  await waitFor(() => expect(searchLibrary).toHaveBeenCalledWith('dark side'));
});

it('hydrates the integrated search from a direct results link', () => {
  renderShell('/search?q=midnight');

  expect(screen.getByRole('searchbox', { name: 'Search artists, albums, and tracks' })).toHaveValue(
    'midnight',
  );
});

it('keeps the persistent player mounted across route navigation', async () => {
  renderShell('/home');
  const player = screen.getByTestId('persistent-player');
  await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.getByTestId('persistent-player')).toBe(player);
});

it('exposes the shared shuffle toggle as an icon in the playback bar', async () => {
  renderShell('/home');

  const shuffle = screen.getByRole('button', { name: 'Enable shuffle' });
  expect(shuffle).toHaveAttribute('aria-pressed', 'false');
  expect(shuffle).toHaveAttribute('title', 'Enable shuffle');
  expect(shuffle.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

  await userEvent.click(shuffle);

  expect(screen.getByRole('button', { name: 'Disable shuffle' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('opens the interactive queue above the player without replacing the current page', async () => {
  const { container } = renderShell('/home');

  const queueTrigger = screen.getByRole('button', {
    name: /^Open queue with 3 items\. Now playing /,
  });
  expect(queueTrigger).toHaveAttribute('aria-controls', 'player-queue-popover');
  expect(queueTrigger).toHaveAttribute('title', 'Open queue');
  expect(queueTrigger.querySelector('.queue-link__copy')).toBeNull();
  expect(queueTrigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

  await userEvent.click(queueTrigger);

  expect(screen.getByRole('region', { name: 'Queue' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /^Close queue with 3 items\. Now playing / }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(container.querySelector('.queue-page')).toBeNull();
  expect(
    screen.getByRole('searchbox', { name: 'Search artists, albums, and tracks' }),
  ).toBeVisible();

  await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
  act(() => usePlaybackStore.getState().replaceAndPlay(songsFixture, 0));
  expect(
    await screen.findByRole('button', { name: /^Open queue with 3 items\. Now playing / }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: 'Queue' })).not.toBeInTheDocument();
});

it('resets the queue popover after removing the final item', async () => {
  usePlaybackStore.getState().replaceAndPlay([songsFixture[0]!], 0);
  renderShell('/home');
  await userEvent.click(
    screen.getByRole('button', { name: /^Open queue with 1 item\. Now playing / }),
  );

  await userEvent.click(
    screen.getByRole('button', { name: `Remove ${songsFixture[0]!.title} from queue` }),
  );
  expect(screen.queryByTestId('persistent-player')).not.toBeInTheDocument();

  act(() => usePlaybackStore.getState().replaceAndPlay(songsFixture, 0));
  expect(
    await screen.findByRole('button', { name: /^Open queue with 3 items\. Now playing / }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: 'Queue' })).not.toBeInTheDocument();
});

function renderShell(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppShell session={sessionFixture} onLogout={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('offers five compact destinations and marks the Library hub active on library routes', async () => {
  renderShell('/albums');

  const primary = screen.getByRole('navigation', { name: 'Primary' });
  const links = within(primary).getAllByRole('link');
  expect(links.map((link) => link.textContent)).toEqual([
    '◇Home',
    '⌕Search',
    '▣Library',
    '≡Playlists',
    '⋯More',
  ]);
  expect(within(primary).getByRole('link', { name: /Library/ })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await userEvent.click(within(primary).getByRole('link', { name: /More/ }));
  expect(await screen.findByRole('heading', { name: 'More', level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Settings.*Account/ })).toHaveAttribute(
    'href',
    '/settings',
  );
});

it('maps drill-down screens to their collection parent', () => {
  expect(parentRoute('/genres/Folk')).toBe('/genres');
  expect(parentRoute('/albums/al%3A1')).toBe('/albums');
  expect(parentRoute('/genres')).toBe('/library');
  expect(parentRoute('/settings')).toBe('/more');
  expect(parentRoute('/home')).toBeNull();
  expect(parentRoute('/library')).toBeNull();
});

it('goes up to the parent hub on a fresh entry and back through history after drilling in', async () => {
  renderShell('/queue');
  expect(screen.queryByRole('button', { name: /^Back to/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Back to More' }));
  expect(await screen.findByRole('heading', { name: 'More', level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();

  await userEvent.click(screen.getByRole('link', { name: /Queue.*Reorder/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Back to More' }));
  expect(await screen.findByRole('heading', { name: 'More', level: 1 })).toBeInTheDocument();
});

it('shows a full Now Playing page with its own transport and a separate visualiser', async () => {
  renderShell('/now-playing');
  const page = screen.getByRole('region', { name: 'Now playing' });

  expect(within(page).getByRole('heading', { name: songsFixture[0]!.title })).toBeInTheDocument();
  expect(within(page).getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
  expect(within(page).getByRole('button', { name: 'Next track' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Music visualizer' })).toBeNull();

  await userEvent.click(within(page).getByRole('link', { name: 'Visualiser' }));
  expect(await screen.findByRole('region', { name: 'Music visualizer' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Back to More' })).toBeInTheDocument();
});
