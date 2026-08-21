import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSongsByGenre } from '../../lib/tauri/library';
import { sessionFixture, songsFixture } from '../../test/fixtures';
import { usePlaybackStore } from '../player/playbackStore';
import { GenrePage } from './GenrePage';

vi.mock('../../lib/tauri/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/tauri/library')>();
  return {
    ...actual,
    getSongsByGenre: vi.fn(),
  };
});

describe('GenrePage playback actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
  });

  it('shuffles every currently loaded genre track through the shared playback action', async () => {
    vi.mocked(getSongsByGenre).mockResolvedValue(songsFixture);
    const user = userEvent.setup();
    renderGenrePage();

    await user.click(await screen.findByRole('button', { name: 'Shuffle loaded tracks' }));

    const playback = usePlaybackStore.getState();
    expect(playback.shuffleMode).toBe(true);
    expect(new Set(playback.queue.map((item) => item.track.id))).toEqual(
      new Set(songsFixture.map((track) => track.id)),
    );
    expect(playback.unshuffledQueue?.map((item) => item.track.id)).toEqual(
      songsFixture.map((track) => track.id),
    );
    expect(screen.getByRole('button', { name: 'Play all' })).toBeEnabled();
  });
});

function renderGenrePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/genres/Dream%20Pop']}>
        <Routes>
          <Route path="/genres/:genre" element={<GenrePage session={sessionFixture} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
