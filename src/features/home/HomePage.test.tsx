import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../lib/tauri/types';
import { albumsFixture, sessionFixture } from '../../test/fixtures';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders loading and then album data', async () => {
    let resolveAlbums: (albums: typeof albumsFixture) => void = () => undefined;
    const loadAlbums = () =>
      new Promise<typeof albumsFixture>((resolve) => {
        resolveAlbums = resolve;
      });
    renderHome(loadAlbums);
    expect(screen.getByLabelText('Loading albums')).toBeInTheDocument();
    resolveAlbums(albumsFixture);
    expect(await screen.findByText('First Album')).toBeInTheDocument();
    expect(screen.getByText('Second Album')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    renderHome(() => Promise.resolve([]));
    expect(await screen.findByText('No albums yet')).toBeInTheDocument();
  });

  it('renders a retryable typed error', async () => {
    renderHome(async () => {
      await Promise.resolve();
      throw new AppError({ code: 'TIMEOUT', message: 'Request timed out.', retryable: false });
    });
    expect(await screen.findByText('Request timed out.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

function renderHome(loadAlbums: (size: number, offset: number) => Promise<typeof albumsFixture>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage
          session={sessionFixture}
          loadAlbums={loadAlbums}
          loadAlbumView={() => Promise.resolve([])}
          loadFavourites={() => Promise.resolve({ artists: [], albums: [], songs: [] })}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
