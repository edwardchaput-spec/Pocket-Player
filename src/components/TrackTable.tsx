import { formatDuration } from '../lib/format';
import { Song } from '../lib/tauri/types';
import { AlbumLink, ArtistLink, TrackTagLinks } from './LibraryLinks';
import { AddToPlaylistButton, FavoriteButton, RatingControl } from './LibraryActions';

interface TrackTableProps {
  tracks: Song[];
  onPlay: (index: number) => void;
  onPlayNext?: (track: Song) => void;
  onAddToQueue?: (track: Song) => void;
  detailed?: boolean;
}

export function TrackTable({
  tracks,
  onPlay,
  onPlayNext,
  onAddToQueue,
  detailed = false,
}: TrackTableProps) {
  return (
    <div className="track-table-scroll">
      <table className={`track-table ${detailed ? 'is-detailed' : ''}`}>
        <thead>
          <tr>
            <th aria-label="Play" />
            <th>Title</th>
            <th>Artist</th>
            <th>Album</th>
            {detailed && <th>Tags</th>}
            <th>Length</th>
            {detailed && <th>Plays</th>}
            {detailed && <th>Rating</th>}
            {detailed && <th>Technical</th>}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, index) => (
            <tr key={track.id}>
              <td>
                <button className="row-play" type="button" onClick={() => onPlay(index)}>
                  <span aria-hidden="true">▶</span>
                  <span className="sr-only">Play {track.title}</span>
                </button>
              </td>
              <td>
                <strong>{track.title}</strong>
                <small>
                  {track.discNumber != null ? `D${track.discNumber} ` : ''}
                  {track.track != null ? `T${track.track}` : ''}
                </small>
              </td>
              <td>
                <ArtistLink artistId={track.artistId} name={track.displayArtist ?? track.artist} />
              </td>
              <td>
                <AlbumLink albumId={track.albumId} name={track.album} />
              </td>
              {detailed && (
                <td>
                  <div className="tag-list">
                    <TrackTagLinks track={track} />
                    {track.year != null && <span>{track.year}</span>}
                    {track.bpm != null && <span>{track.bpm} BPM</span>}
                  </div>
                </td>
              )}
              <td className="numeric">{formatDuration(track.duration)}</td>
              {detailed && <td className="numeric">{track.playCount?.toLocaleString() ?? '—'}</td>}
              {detailed && (
                <td>
                  <RatingControl id={track.id} value={track.userRating} />
                </td>
              )}
              {detailed && <td className="technical">{technicalLabel(track)}</td>}
              <td>
                <div className="row-actions">
                  <FavoriteButton
                    id={track.id}
                    itemType="song"
                    starred={track.starred}
                    label={track.title}
                  />
                  <AddToPlaylistButton track={track} />
                  {onPlayNext && (
                    <button type="button" onClick={() => onPlayNext(track)} title="Play next">
                      +1
                    </button>
                  )}
                  {onAddToQueue && (
                    <button type="button" onClick={() => onAddToQueue(track)} title="Add to queue">
                      +
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function technicalLabel(track: Song): string {
  return [
    track.suffix?.toUpperCase(),
    track.bitRate != null ? `${track.bitRate} kbps` : null,
    track.bitDepth != null ? `${track.bitDepth}-bit` : null,
    track.samplingRate != null ? `${(track.samplingRate / 1000).toFixed(1)} kHz` : null,
    track.channelCount != null ? `${track.channelCount}ch` : null,
    track.size != null ? formatBytes(track.size) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
