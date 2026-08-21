import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPlaylist } from '../../lib/tauri/library';
import { sessionFixture, songsFixture } from '../../test/fixtures';
import { usePlaybackStore } from '../player/playbackStore';
import { PlaylistPage } from './PlaylistPage';

vi.mock('../../lib/tauri/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/tauri/library')>();
  return {
    ...actual,
    deletePlaylist: vi.fn(),
    getPlaylist: vi.fn(),
    replacePlaylist: vi.fn(),
  };
});

describe('PlaylistPage playback actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
  });

  it('shuffles the complete editable playlist while preserving the Play action', async () => {
    vi.mocked(getPlaylist).mockResolvedValue({
      id: 'playlist:opaque',
      name: 'Evening queue',
      songCount: songsFixture.length,
      songs: songsFixture,
    });
    const user = userEvent.setup();
    renderPlaylistPage();

    await user.click(await screen.findByRole('button', { name: 'Shuffle all' }));

    const playback = usePlaybackStore.getState();
    expect(playback.shuffleMode).toBe(true);
    expect(new Set(playback.queue.map((item) => item.track.id))).toEqual(
      new Set(songsFixture.map((track) => track.id)),
    );
    expect(playback.unshuffledQueue?.map((item) => item.track.id)).toEqual(
      songsFixture.map((track) => track.id),
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
  });
});

function renderPlaylistPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/playlists/playlist%3Aopaque']}>
        <Routes>
          <Route
            path="/playlists/:playlistId"
            element={<PlaylistPage session={sessionFixture} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
