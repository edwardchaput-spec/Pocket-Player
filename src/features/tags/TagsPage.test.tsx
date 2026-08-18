import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTags, queryTracks } from '../../lib/tauri/library';
import { sessionFixture, songsFixture } from '../../test/fixtures';
import { TagPage } from './TagPage';
import { TagsPage } from './TagsPage';

vi.mock('../../lib/tauri/library', () => ({
  getTags: vi.fn(),
  queryTracks: vi.fn(),
  setRating: vi.fn(() => Promise.resolve()),
  setStarred: vi.fn(() => Promise.resolve()),
  getPlaylists: vi.fn(() => Promise.resolve([])),
}));

function renderRoute(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tags" element={<TagsPage session={sessionFixture} />} />
          <Route path="/tags/:tag" element={<TagPage session={sessionFixture} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('tag navigation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists indexed tags with counts and exact detail links', async () => {
    vi.mocked(getTags).mockResolvedValue([
      { name: 'Dream Pop', songCount: 42, albumCount: 7, categories: ['Genre', 'Mood'] },
    ]);
    renderRoute('/tags');
    expect(await screen.findByRole('link', { name: /Dream Pop/ })).toHaveAttribute(
      'href',
      '/tags/Dream%20Pop',
    );
    expect(screen.getByText(/42 tracks/)).toBeInTheDocument();
  });

  it('queries the exact decoded tag and shows navigable track metadata', async () => {
    const taggedTracks = [
      {
        ...songsFixture[0]!,
        artist: 'First Artist',
        artistId: 'artist:one',
        album: 'First Album',
        albumId: 'album:one',
      },
    ];
    vi.mocked(queryTracks).mockResolvedValue({
      tracks: taggedTracks,
      total: taggedTracks.length,
      refreshedAt: '2026-08-18T00:00:00Z',
    });
    renderRoute('/tags/Dream%20Pop');
    expect(await screen.findByRole('heading', { name: 'Dream Pop' })).toBeInTheDocument();
    const artistLink = await screen.findByRole('link', { name: 'First Artist' });
    expect(queryTracks).toHaveBeenCalledWith(expect.objectContaining({ tag: 'Dream Pop' }));
    expect(artistLink).toHaveAttribute('href', '/artists/artist%3Aone');
  });
});
