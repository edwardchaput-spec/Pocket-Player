import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

import { getNewestAlbums, searchLibrary } from '../lib/tauri/library';
import { sessionFixture, songsFixture } from '../test/fixtures';
import { usePlaybackStore } from '../features/player/playbackStore';
import { AppShell } from './AppShell';

vi.mock('../lib/tauri/library', () => ({
  getNewestAlbums: vi.fn(),
  getAlbum: vi.fn(),
  getAlbumList: vi.fn(() => Promise.resolve([])),
  getPlaylists: vi.fn(() => Promise.resolve([])),
  getStarred: vi.fn(() => Promise.resolve({ artists: [], albums: [], songs: [] })),
  searchLibrary: vi.fn(() => Promise.resolve({ artists: [], albums: [], songs: [] })),
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
