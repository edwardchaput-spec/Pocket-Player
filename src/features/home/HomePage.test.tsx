import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

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

  it('loads the next album page when the scroll sentinel approaches the viewport', async () => {
    const page = Array.from({ length: 24 }, (_, index) => ({
      ...albumsFixture[0]!,
      id: `album-${index}`,
      name: `Album ${index}`,
    }));
    const loadAlbums = vi.fn((_size: number, offset: number) =>
      Promise.resolve(offset === 0 ? page : []),
    );
    const originalObserver = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        queueMicrotask(() =>
          callback([{ isIntersecting: true } as IntersectionObserverEntry], this),
        );
      }
      disconnect() {}
      observe() {}
      takeRecords() {
        return [];
      }
      unobserve() {}
      readonly root = null;
      readonly rootMargin = '0px';
      readonly scrollMargin = '0px';
      readonly thresholds = [0];
    };

    try {
      renderHome(loadAlbums);
      await waitFor(() => expect(loadAlbums).toHaveBeenCalledWith(24, 24));
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    } finally {
      globalThis.IntersectionObserver = originalObserver;
    }
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
