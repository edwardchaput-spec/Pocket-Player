import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAlbum } from '../../lib/tauri/library';
import { albumFixture, sessionFixture } from '../../test/fixtures';
import { usePlaybackStore } from '../player/playbackStore';
import { AlbumPage } from './AlbumPage';

vi.mock('../../lib/tauri/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/tauri/library')>();
  return {
    ...actual,
    getAlbum: vi.fn(),
  };
});

describe('AlbumPage playback actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
  });

  it('uses the shared shuffled-play action for every album track', async () => {
    vi.mocked(getAlbum).mockResolvedValue(albumFixture);
    const user = userEvent.setup();
    renderAlbumPage();

    await user.click(await screen.findByRole('button', { name: 'Shuffle all' }));

    const playback = usePlaybackStore.getState();
    expect(playback.shuffleMode).toBe(true);
    expect(playback.queue).toHaveLength(albumFixture.songs.length);
    expect(new Set(playback.queue.map((item) => item.track.id))).toEqual(
      new Set(albumFixture.songs.map((track) => track.id)),
    );
    expect(playback.unshuffledQueue?.map((item) => item.track.id)).toEqual([
      'song-1',
      'song-2',
      'song-3',
    ]);
  });
});

function renderAlbumPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/albums/album%3Aone']}>
        <Routes>
          <Route path="/albums/:albumId" element={<AlbumPage session={sessionFixture} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
