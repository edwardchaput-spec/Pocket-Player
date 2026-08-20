import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMix, getGenres, getTags } from '../../lib/tauri/library';
import { sessionFixture } from '../../test/fixtures';
import { MixPage } from './MixPage';

vi.mock('../../lib/tauri/library', () => ({
  generateMix: vi.fn(),
  getGenres: vi.fn(),
  getTags: vi.fn(),
  getPlaylist: vi.fn(),
  getPlaylists: vi.fn(() => Promise.resolve([])),
  replacePlaylist: vi.fn(),
  setRating: vi.fn(),
  setStarred: vi.fn(),
}));

function renderMix() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/mix']}>
        <MixPage session={sessionFixture} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return user;
}

describe('Track Mix tag exclusions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGenres).mockResolvedValue([
      { value: 'Rock', songCount: 12, albumCount: 2 },
      { value: 'Ambient', songCount: 8, albumCount: 1 },
    ]);
    vi.mocked(generateMix).mockResolvedValue({ seed: 'fixed-seed', items: [], warnings: [] });
  });

  it('shows the indexed genre catalogue when the library has no mood tags', async () => {
    vi.mocked(getTags).mockResolvedValue([
      { name: 'Rock', songCount: 12, albumCount: 2, categories: ['Genre'] },
      { name: 'Ambient', songCount: 8, albumCount: 1, categories: ['Genre'] },
    ]);
    renderMix();

    expect(await screen.findByRole('checkbox', { name: 'Exclude Rock (Genre)' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Exclude Ambient (Genre)' })).toBeVisible();
    expect(screen.getByText(/genre-classified tags only/i)).toBeVisible();
  });

  it('keeps genre-only entries in the dedicated genre field when mood tags exist', async () => {
    vi.mocked(getTags).mockResolvedValue([
      { name: 'Rock', songCount: 12, albumCount: 2, categories: ['Genre'] },
      { name: 'Focused', songCount: 4, albumCount: 3, categories: ['Mood'] },
      { name: 'Dream Pop', songCount: 6, albumCount: 2, categories: ['Genre', 'Mood'] },
    ]);
    renderMix();

    expect(await screen.findByRole('checkbox', { name: 'Exclude Focused (Mood)' })).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'Exclude Dream Pop (Genre + Mood)' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('checkbox', { name: 'Exclude Rock (Genre)' }),
    ).not.toBeInTheDocument();
  });

  it('maps selected catalogue categories to effective mix exclusions', async () => {
    vi.mocked(getTags).mockResolvedValue([
      { name: 'Dream Pop', songCount: 6, albumCount: 2, categories: ['Genre', 'Mood'] },
    ]);
    const user = renderMix();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Exclude Dream Pop (Genre + Mood)' }),
    );
    await user.click(screen.getByRole('button', { name: 'Build mix' }));

    await waitFor(() =>
      expect(generateMix).toHaveBeenCalledWith(
        expect.objectContaining({
          excludedGenres: ['Dream Pop'],
          excludedTags: ['Dream Pop'],
        }),
      ),
    );
  });

  it('explains when the real index has no tags', async () => {
    vi.mocked(getTags).mockResolvedValue([]);
    renderMix();

    expect(await screen.findByText('No indexed genre or mood tags were found.')).toBeVisible();
  });

  it('shows loading and retryable error states', async () => {
    vi.mocked(getTags)
      .mockRejectedValueOnce(new Error('index unavailable'))
      .mockResolvedValueOnce([
        { name: 'Focused', songCount: 4, albumCount: 3, categories: ['Mood'] },
      ]);
    const user = renderMix();

    expect(screen.getByRole('status')).toHaveTextContent('Loading indexed tags');
    expect(await screen.findByRole('alert')).toHaveTextContent('index unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('checkbox', { name: 'Exclude Focused (Mood)' })).toBeVisible();
    expect(getTags).toHaveBeenCalledTimes(2);
  });
});
