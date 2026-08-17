import fallbackArtwork from '../assets/fallback-artwork.svg';

interface ArtworkProps {
  proxyBaseUrl: string;
  coverId?: string | null | undefined;
  size?: number;
  alt: string;
  className?: string;
}

export function Artwork({ proxyBaseUrl, coverId, size = 360, alt, className }: ArtworkProps) {
  const source = coverId
    ? `${proxyBaseUrl}/cover/${encodeURIComponent(coverId)}?size=${size}`
    : fallbackArtwork;
  return (
    <img
      className={className}
      src={source}
      alt={alt}
      loading="lazy"
      onError={(event) => {
        if (event.currentTarget.src !== fallbackArtwork) event.currentTarget.src = fallbackArtwork;
      }}
    />
  );
}
