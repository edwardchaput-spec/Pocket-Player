import { Link } from 'react-router-dom';

import { AlbumSummary } from '../lib/tauri/types';
import { Artwork } from './Artwork';
import { AlbumLink, ArtistLink } from './LibraryLinks';

export function AlbumGrid({
  albums,
  proxyBaseUrl,
}: {
  albums: AlbumSummary[];
  proxyBaseUrl: string;
}) {
  return (
    <div className="album-grid">
      {albums.map((album) => (
        <article className="album-card" key={album.id}>
          <Link className="album-cover-link" to={`/albums/${encodeURIComponent(album.id)}`}>
            <Artwork
              className="album-artwork"
              proxyBaseUrl={proxyBaseUrl}
              coverId={album.coverArt}
              alt={`Cover for ${album.name}`}
            />
          </Link>
          <AlbumLink albumId={album.id} name={album.name} className="album-title-link" />
          <ArtistLink artistId={album.artistId} name={album.artist} className="album-artist-link" />
          <small>
            {[album.year, album.songCount != null ? `${album.songCount} tracks` : null]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </article>
      ))}
    </div>
  );
}
