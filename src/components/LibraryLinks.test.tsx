import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Song } from '../lib/tauri/types';
import { ArtistLink, AlbumLink, TrackTagLinks, trackTagNames } from './LibraryLinks';

const track: Song = {
  id: 'track/string-id',
  title: 'Track',
  genre: 'Rock',
  genres: [{ name: 'rock' }, { name: 'Alternative' }],
  moods: ['Energetic'],
};

describe('library metadata links', () => {
  it('uses opaque IDs and URL-encodes route segments', () => {
    render(
      <MemoryRouter>
        <ArtistLink artistId="artist/id" name="Artist" />
        <AlbumLink albumId="album/id" name="Album" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Artist' })).toHaveAttribute(
      'href',
      '/artists/artist%2Fid',
    );
    expect(screen.getByRole('link', { name: 'Album' })).toHaveAttribute(
      'href',
      '/albums/album%2Fid',
    );
  });

  it('deduplicates tags case-insensitively and links each exact value', () => {
    expect(trackTagNames(track)).toEqual(['Rock', 'Alternative', 'Energetic']);
    render(
      <MemoryRouter>
        <TrackTagLinks track={track} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Energetic' })).toHaveAttribute(
      'href',
      '/tags/Energetic',
    );
  });
});
