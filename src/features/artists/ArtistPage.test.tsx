import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getArtist, getArtistSongs } from '../../lib/tauri/library';
import { albumsFixture, sessionFixture, songsFixture } from '../../test/fixtures';
import { usePlaybackStore } from '../player/playbackStore';
import { ArtistPage } from './ArtistPage';

vi.mock('../../lib/tauri/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/tauri/library')>();
  return {
    ...actual,
    getArtist: vi.fn(),
    getArtistSongs: vi.fn(),
  };
});

const artistFixture = {
  id: 'artist:opaque',
  name: 'Test Artist',
  albumCount: albumsFixture.length,
  albums: albumsFixture,
};

describe('ArtistPage playback actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
    vi.mocked(getArtist).mockResolvedValue(artistFixture);
  });

  it('loads the exact opaque artist and plays every returned track in order', async () => {
    vi.mocked(getArtistSongs).mockResolvedValue(songsFixture);
    const user = userEvent.setup();
    renderArtistPage();

    await user.click(await screen.findByRole('button', { name: /Play all/ }));

    await waitFor(() => expect(getArtistSongs).toHaveBeenCalledWith('artist:opaque'));
    expect(usePlaybackStore.getState().queue.map((item) => item.track.id)).toEqual(
      songsFixture.map((track) => track.id),
    );
  });

  it('forces shuffle on when Shuffle all is selected', async () => {
    vi.mocked(getArtistSongs).mockResolvedValue(songsFixture);
    const user = userEvent.setup();
    renderArtistPage();

    await user.click(await screen.findByRole('button', { name: 'Shuffle all' }));

    await waitFor(() => expect(usePlaybackStore.getState().shuffleMode).toBe(true));
    expect(new Set(usePlaybackStore.getState().queue.map((item) => item.track.id))).toEqual(
      new Set(songsFixture.map((track) => track.id)),
    );
  });

  it('shows loading and errors without replacing the existing queue', async () => {
    let rejectLoad: ((reason: Error) => void) | undefined;
    vi.mocked(getArtistSongs).mockReturnValue(
      new Promise((_, reject) => {
        rejectLoad = reject;
      }),
    );
    usePlaybackStore.getState().replaceAndPlay([songsFixture[0]!]);
    const originalOccurrence = usePlaybackStore.getState().queue[0]!.occurrenceId;
    const user = userEvent.setup();
    renderArtistPage();

    await user.click(await screen.findByRole('button', { name: 'Shuffle all' }));
    expect(screen.getByRole('button', { name: 'Loading tracks…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Play all/ })).toBeDisabled();

    act(() => rejectLoad?.(new Error('One album could not be loaded.')));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load every track for Test Artist. One album could not be loaded.',
    );
    expect(usePlaybackStore.getState().queue[0]?.occurrenceId).toBe(originalOccurrence);
  });

  it('reports an artist with albums but no playable tracks', async () => {
    vi.mocked(getArtistSongs).mockResolvedValue([]);
    const user = userEvent.setup();
    renderArtistPage();

    await user.click(await screen.findByRole('button', { name: /Play all/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Navidrome returned no playable tracks for Test Artist.',
    );
  });
});

function renderArtistPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/artists/artist%3Aopaque']}>
        <Routes>
          <Route path="/artists/:artistId" element={<ArtistPage session={sessionFixture} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
