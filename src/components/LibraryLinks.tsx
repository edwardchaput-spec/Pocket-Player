import { Link } from 'react-router-dom';

import { Song } from '../lib/tauri/types';

export function ArtistLink({
  artistId,
  name,
  className,
}: {
  artistId?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
}) {
  const label = name?.trim() || 'Unknown artist';
  return artistId ? (
    <Link className={className} to={`/artists/${encodeURIComponent(artistId)}`}>
      {label}
    </Link>
  ) : (
    <span className={className}>{label}</span>
  );
}

export function AlbumLink({
  albumId,
  name,
  className,
}: {
  albumId?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
}) {
  const label = name?.trim() || 'Unknown album';
  return albumId ? (
    <Link className={className} to={`/albums/${encodeURIComponent(albumId)}`}>
      {label}
    </Link>
  ) : (
    <span className={className}>{label}</span>
  );
}

export function TagLink({ name, className }: { name: string; className?: string | undefined }) {
  return (
    <Link className={className} to={`/tags/${encodeURIComponent(name)}`}>
      {name}
    </Link>
  );
}

export function TrackTagLinks({ track, limit = 4 }: { track: Song; limit?: number }) {
  return (
    <>
      {trackTagNames(track)
        .slice(0, limit)
        .map((tag) => (
          <TagLink key={tag.toLocaleLowerCase()} name={tag} />
        ))}
    </>
  );
}

export function trackTagNames(track: Song): string[] {
  const names = [
    track.genre,
    ...(track.genres ?? []).map((genre) => genre.name),
    ...(track.moods ?? []),
  ];
  const seen = new Set<string>();
  return names.flatMap((value) => {
    const name = value?.trim();
    if (!name) return [];
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}
