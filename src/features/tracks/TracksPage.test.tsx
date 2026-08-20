import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryTracks } from '../../lib/tauri/library';
import { sessionFixture, songsFixture } from '../../test/fixtures';
import { TracksPage } from './TracksPage';

vi.mock('../../lib/tauri/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/tauri/library')>();
  return {
    ...actual,
    getGenres: vi.fn(() => Promise.resolve([])),
    queryTracks: vi.fn(() =>
      Promise.resolve({
        tracks: songsFixture,
        total: songsFixture.length,
        refreshedAt: '2026-08-20T12:00:00Z',
      }),
    ),
  };
});

describe('TracksPage table sorting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries the complete index with the composite format sort in both directions', async () => {
    const user = userEvent.setup();
    renderTracksPage();

    const ascendingButton = await screen.findByRole('button', { name: /^Sort by Format/ });
    await user.click(ascendingButton);
    await waitFor(() =>
      expect(queryTracks).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'format', descending: false }),
      ),
    );

    const descendingButton = await screen.findByRole('button', {
      name: /^Sort by Format; ascending/,
    });
    expect(descendingButton.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    await user.click(descendingButton);
    await waitFor(() =>
      expect(queryTracks).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'format', descending: true }),
      ),
    );
  });
});

function renderTracksPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TracksPage session={sessionFixture} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
