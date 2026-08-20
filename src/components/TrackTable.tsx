import { useMemo, useState } from 'react';

import { formatDuration } from '../lib/format';
import { Song } from '../lib/tauri/types';
import { AddToPlaylistButton, FavoriteButton, RatingControl } from './LibraryActions';
import { AlbumLink, ArtistLink, TrackTagLinks, trackTagNames } from './LibraryLinks';
import './TrackTable.css';

export type TrackTableSortKey =
  | 'title'
  | 'artist'
  | 'album'
  | 'tags'
  | 'duration'
  | 'playCount'
  | 'rating'
  | 'format'
  | 'bitRate'
  | 'size';

export interface TrackTableSort {
  key: TrackTableSortKey;
  direction: 'ascending' | 'descending';
}

interface TrackTableProps {
  tracks: Song[];
  onPlay: (index: number, displayedTracks: Song[]) => void;
  onPlayNext?: ((track: Song) => void) | undefined;
  onAddToQueue?: ((track: Song) => void) | undefined;
  detailed?: boolean | undefined;
  /** The active sort when a parent (for example, a paged server query) owns sorting. */
  sort?: TrackTableSort | null | undefined;
  onSortChange?: ((sort: TrackTableSort) => void) | undefined;
  /** Render the supplied order while still exposing controlled sortable headers. */
  manualSorting?: boolean | undefined;
}

const TEXT_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function TrackTable({
  tracks,
  onPlay,
  onPlayNext,
  onAddToQueue,
  detailed = false,
  sort,
  onSortChange,
  manualSorting = false,
}: TrackTableProps) {
  const [internalSort, setInternalSort] = useState<TrackTableSort | null>(null);
  const controlled = sort !== undefined;
  const activeSort = controlled ? sort : internalSort;
  const rows = useMemo(() => {
    const sourceRows = tracks.map((track, sourceIndex) => ({ track, sourceIndex }));
    if (!activeSort || manualSorting) return sourceRows;
    return sourceRows.sort((left, right) => {
      const comparison = compareTracks(left.track, right.track, activeSort);
      return comparison || left.sourceIndex - right.sourceIndex;
    });
  }, [activeSort, manualSorting, tracks]);
  const displayedTracks = useMemo(() => rows.map(({ track }) => track), [rows]);

  const requestSort = (key: TrackTableSortKey) => {
    const next: TrackTableSort = {
      key,
      direction:
        activeSort?.key === key && activeSort.direction === 'ascending'
          ? 'descending'
          : 'ascending',
    };
    if (!controlled) setInternalSort(next);
    onSortChange?.(next);
  };

  return (
    <div className="track-table-scroll">
      <table className={`track-table ${detailed ? 'is-detailed' : ''}`}>
        <thead>
          <tr>
            <th scope="col" aria-label="Play" />
            <SortableHeader label="Title" sortKey="title" sort={activeSort} onSort={requestSort} />
            <SortableHeader
              label="Artist"
              sortKey="artist"
              sort={activeSort}
              onSort={requestSort}
            />
            <SortableHeader label="Album" sortKey="album" sort={activeSort} onSort={requestSort} />
            {detailed && (
              <SortableHeader label="Tags" sortKey="tags" sort={activeSort} onSort={requestSort} />
            )}
            <SortableHeader
              className="numeric"
              label="Length"
              sortKey="duration"
              sort={activeSort}
              onSort={requestSort}
            />
            {detailed && (
              <SortableHeader
                className="numeric"
                label="Plays"
                sortKey="playCount"
                sort={activeSort}
                onSort={requestSort}
              />
            )}
            {detailed && (
              <SortableHeader
                label="Rating"
                sortKey="rating"
                sort={activeSort}
                onSort={requestSort}
              />
            )}
            {detailed && (
              <SortableHeader
                label="Format"
                sortKey="format"
                sort={activeSort}
                onSort={requestSort}
              />
            )}
            {detailed && (
              <SortableHeader
                className="numeric"
                label="Bitrate"
                sortKey="bitRate"
                sort={activeSort}
                onSort={requestSort}
              />
            )}
            {detailed && (
              <SortableHeader
                className="numeric"
                label="Size"
                sortKey="size"
                sort={activeSort}
                onSort={requestSort}
              />
            )}
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ track, sourceIndex }, index) => (
            <tr key={`${track.id}:${sourceIndex}`}>
              <td>
                <button
                  className="row-play"
                  type="button"
                  onClick={() => onPlay(index, displayedTracks)}
                >
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
              {detailed && <td className="track-format">{formatLabel(track)}</td>}
              {detailed && <td className="numeric track-bitrate">{bitRateLabel(track)}</td>}
              {detailed && <td className="numeric track-size">{sizeLabel(track)}</td>}
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

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: TrackTableSortKey;
  sort: TrackTableSort | null;
  onSort: (key: TrackTableSortKey) => void;
  className?: string;
}) {
  const direction = sort?.key === sortKey ? sort.direction : 'none';
  const nextDirection = direction === 'ascending' ? 'descending' : 'ascending';
  return (
    <th className={className} scope="col" aria-sort={direction}>
      <button
        className="track-sort-button"
        type="button"
        aria-label={`Sort by ${label}; ${direction}. Activate to sort ${nextDirection}.`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <span className="track-sort-indicator" aria-hidden="true">
          {direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}
        </span>
      </button>
    </th>
  );
}

function compareTracks(left: Song, right: Song, sort: TrackTableSort): number {
  const direction = sort.direction === 'ascending' ? 1 : -1;
  switch (sort.key) {
    case 'title':
      return compareText(left.title, right.title, direction);
    case 'artist':
      return compareText(
        left.displayArtist ?? left.artist,
        right.displayArtist ?? right.artist,
        direction,
      );
    case 'album':
      return compareText(left.album, right.album, direction);
    case 'tags':
      return compareText(tagSortLabel(left), tagSortLabel(right), direction);
    case 'duration':
      return compareNumber(left.duration, right.duration, direction);
    case 'playCount':
      return compareNumber(left.playCount, right.playCount, direction);
    case 'rating':
      return compareNumber(left.userRating, right.userRating, direction);
    case 'format':
      return compareFormat(left, right, direction);
    case 'bitRate':
      return compareNumber(left.bitRate, right.bitRate, direction);
    case 'size':
      return compareNumber(left.size, right.size, direction);
  }
}

function compareFormat(left: Song, right: Song, direction: number): number {
  return (
    compareText(fileFormat(left), fileFormat(right), direction) ||
    compareNumber(left.samplingRate, right.samplingRate, direction) ||
    compareNumber(left.bitDepth, right.bitDepth, direction) ||
    compareNumber(left.channelCount, right.channelCount, direction)
  );
}

function compareText(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: number,
): number {
  const leftValue = left?.trim();
  const rightValue = right?.trim();
  if (!leftValue && !rightValue) return 0;
  if (!leftValue) return 1;
  if (!rightValue) return -1;
  return TEXT_COLLATOR.compare(leftValue, rightValue) * direction;
}

function compareNumber(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: number,
): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return (left - right) * direction;
}

function tagSortLabel(track: Song): string | null {
  const values = [
    ...trackTagNames(track),
    track.year != null ? String(track.year) : null,
    track.bpm != null ? `${track.bpm} BPM` : null,
  ].filter((value): value is string => value != null);
  return values.length ? values.join('\u001f') : null;
}

function fileFormat(track: Song): string | null {
  const suffix = track.suffix?.trim();
  if (suffix) return suffix.toUpperCase();
  const contentType = track.contentType?.trim();
  if (!contentType) return null;
  return (contentType.split('/').at(-1) ?? contentType).toUpperCase();
}

function formatLabel(track: Song): string {
  const format = fileFormat(track);
  const sampleRate = sampleRateLabel(track.samplingRate);
  const primary = [format, sampleRate].filter(Boolean).join(' ');
  const details = [
    track.bitDepth != null ? `${track.bitDepth}-bit` : null,
    track.channelCount != null ? `${track.channelCount} ch` : null,
  ].filter(Boolean);
  return [primary || null, ...details].filter(Boolean).join(' · ') || '—';
}

function sampleRateLabel(value: number | null | undefined): string | null {
  if (value == null) return null;
  const kilohertz = value / 1000;
  return `${kilohertz.toFixed(2).replace(/\.0+$|(?<=\.[0-9])0$/, '')} kHz`;
}

function bitRateLabel(track: Song): string {
  return track.bitRate != null ? `${track.bitRate.toLocaleString()} kbps` : '—';
}

function sizeLabel(track: Song): string {
  if (track.size == null) return '—';
  return formatBytes(track.size);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
