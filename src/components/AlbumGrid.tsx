import { Link } from 'react-router-dom';

import { AlbumSummary } from '../lib/tauri/types';
import { Artwork } from './Artwork';

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
        <Link className="album-card" key={album.id} to={`/albums/${encodeURIComponent(album.id)}`}>
          <Artwork
            className="album-artwork"
            proxyBaseUrl={proxyBaseUrl}
            coverId={album.coverArt}
            alt={`Cover for ${album.name}`}
          />
          <strong title={album.name}>{album.name}</strong>
          <span title={album.artist ?? undefined}>{album.artist ?? 'Unknown artist'}</span>
          <small>
            {[album.year, album.songCount != null ? `${album.songCount} tracks` : null]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </Link>
      ))}
    </div>
  );
}
