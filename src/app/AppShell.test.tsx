import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

import { getNewestAlbums } from '../lib/tauri/library';
import { sessionFixture, songsFixture } from '../test/fixtures';
import { usePlaybackStore } from '../features/player/playbackStore';
import { AppShell } from './AppShell';

vi.mock('../lib/tauri/library', () => ({
  getNewestAlbums: vi.fn(),
  getAlbum: vi.fn(),
  getAlbumList: vi.fn(() => Promise.resolve([])),
  getPlaylists: vi.fn(() => Promise.resolve([])),
  getStarred: vi.fn(() => Promise.resolve({ artists: [], albums: [], songs: [] })),
}));
vi.mock('../lib/tauri/playback', () => ({
  reportScrobble: vi.fn(() => Promise.resolve(true)),
  savePlayerSettings: vi.fn(() => Promise.resolve()),
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
  usePlaybackStore.getState().clear();
  usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
});

it('keeps the persistent player mounted across route navigation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/home']}>
        <AppShell session={sessionFixture} onLogout={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const player = screen.getByTestId('persistent-player');
  await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.getByTestId('persistent-player')).toBe(player);
});
