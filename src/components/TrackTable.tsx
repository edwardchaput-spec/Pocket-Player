import { type ReactNode, useId, useMemo, useState } from 'react';

import { usePlaybackStore } from '../features/player/playbackStore';
import { formatDate, formatDuration } from '../lib/format';
import {
  DEFAULT_DETAILED_TRACK_COLUMNS,
  DEFAULT_STANDARD_TRACK_COLUMNS,
  Song,
  type TrackTableColumnId as PersistedTrackTableColumnId,
} from '../lib/tauri/types';
import { AddToPlaylistButton, FavoriteButton, RatingControl } from './LibraryActions';
import { AlbumLink, ArtistLink, TagLink, TrackTagLinks, trackTagNames } from './LibraryLinks';
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

export type TrackTableColumnId = PersistedTrackTableColumnId;
export const STANDARD_TRACK_COLUMNS: readonly TrackTableColumnId[] = DEFAULT_STANDARD_TRACK_COLUMNS;
export const DETAILED_TRACK_COLUMNS: readonly TrackTableColumnId[] = DEFAULT_DETAILED_TRACK_COLUMNS;

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
  /** The visible data columns. Title is always restored if it is omitted. */
  visibleColumns?: readonly TrackTableColumnId[] | undefined;
  onVisibleColumnsChange?: ((columns: TrackTableColumnId[]) => void) | undefined;
}

const TEXT_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

interface TrackTableColumnDefinition {
  id: TrackTableColumnId;
  label: string;
  className?: string;
  sortKey?: TrackTableSortKey;
  render: (track: Song) => ReactNode;
}

const TRACK_TABLE_COLUMNS: readonly TrackTableColumnDefinition[] = [
  {
    id: 'title',
    label: 'Title',
    className: 'track-column-title',
    sortKey: 'title',
    render: (track) => (
      <>
        <strong title={track.title}>{track.title}</strong>
        <small>
          {track.discNumber != null ? `D${track.discNumber} ` : ''}
          {track.track != null ? `T${track.track}` : ''}
        </small>
      </>
    ),
  },
  {
    id: 'artist',
    label: 'Artist',
    className: 'track-column-artist',
    sortKey: 'artist',
    render: (track) => (
      <ArtistLink
        artistId={track.artistId}
        className="track-cell-link"
        name={track.displayArtist ?? track.artist}
      />
    ),
  },
  {
    id: 'album',
    label: 'Album',
    className: 'track-column-album',
    sortKey: 'album',
    render: (track) => (
      <AlbumLink albumId={track.albumId} className="track-cell-link" name={track.album} />
    ),
  },
  {
    id: 'displayAlbumArtist',
    label: 'Album artist',
    className: 'track-column-album-artist',
    render: (track) => <TextCell value={track.displayAlbumArtist} />,
  },
  {
    id: 'track',
    label: 'Track',
    className: 'numeric track-column-track',
    render: (track) => track.track?.toLocaleString() ?? '—',
  },
  {
    id: 'discNumber',
    label: 'Disc',
    className: 'numeric track-column-disc',
    render: (track) => track.discNumber?.toLocaleString() ?? '—',
  },
  {
    id: 'year',
    label: 'Year',
    className: 'numeric track-column-year',
    render: (track) => track.year?.toLocaleString() ?? '—',
  },
  {
    id: 'genres',
    label: 'Genres',
    className: 'track-column-tags',
    render: (track) => <MetadataTagLinks names={genreNames(track)} />,
  },
  {
    id: 'moods',
    label: 'Moods',
    className: 'track-column-tags',
    render: (track) => <MetadataTagLinks names={cleanNames(track.moods ?? [])} />,
  },
  {
    id: 'tags',
    label: 'Tags',
    className: 'track-column-tags',
    sortKey: 'tags',
    render: (track) => (
      <div className="tag-list">
        <TrackTagLinks track={track} />
        {track.year != null && <span>{track.year}</span>}
        {track.bpm != null && <span>{track.bpm} BPM</span>}
      </div>
    ),
  },
  {
    id: 'duration',
    label: 'Length',
    className: 'numeric track-column-duration',
    sortKey: 'duration',
    render: (track) => formatDuration(track.duration),
  },
  {
    id: 'playCount',
    label: 'Plays',
    className: 'numeric track-column-plays',
    sortKey: 'playCount',
    render: (track) => track.playCount?.toLocaleString() ?? '—',
  },
  {
    id: 'rating',
    label: 'Rating',
    className: 'track-column-rating',
    sortKey: 'rating',
    render: (track) => <RatingControl id={track.id} value={track.userRating} />,
  },
  {
    id: 'averageRating',
    label: 'Average rating',
    className: 'numeric track-column-average-rating',
    render: (track) => ratingLabel(track.averageRating),
  },
  {
    id: 'starred',
    label: 'Favourite',
    className: 'track-column-favourite',
    render: (track) => (
      <span aria-label={track.starred ? 'Favourite' : 'Not favourite'}>
        {track.starred ? 'Yes' : '—'}
      </span>
    ),
  },
  {
    id: 'bpm',
    label: 'BPM',
    className: 'numeric track-column-bpm',
    render: (track) => (track.bpm != null ? `${track.bpm.toLocaleString()} BPM` : '—'),
  },
  {
    id: 'format',
    label: 'Format',
    className: 'track-format',
    sortKey: 'format',
    render: formatLabel,
  },
  {
    id: 'suffix',
    label: 'File type',
    className: 'technical track-column-file-type',
    render: (track) => fileFormat(track) ?? '—',
  },
  {
    id: 'contentType',
    label: 'Content type',
    className: 'technical track-column-content-type',
    render: (track) => <TextCell value={track.contentType} />,
  },
  {
    id: 'bitRate',
    label: 'Bitrate',
    className: 'numeric track-bitrate',
    sortKey: 'bitRate',
    render: bitRateLabel,
  },
  {
    id: 'bitDepth',
    label: 'Bit depth',
    className: 'numeric track-column-bit-depth',
    render: (track) => (track.bitDepth != null ? `${track.bitDepth}-bit` : '—'),
  },
  {
    id: 'samplingRate',
    label: 'Sample rate',
    className: 'numeric track-column-sample-rate',
    render: (track) => sampleRateLabel(track.samplingRate) ?? '—',
  },
  {
    id: 'channelCount',
    label: 'Channels',
    className: 'numeric track-column-channels',
    render: (track) => (track.channelCount != null ? `${track.channelCount} ch` : '—'),
  },
  {
    id: 'size',
    label: 'Size',
    className: 'numeric track-size',
    sortKey: 'size',
    render: sizeLabel,
  },
  {
    id: 'created',
    label: 'Date added',
    className: 'track-column-created',
    render: (track) => (track.created ? formatDate(track.created) : '—'),
  },
  {
    id: 'comment',
    label: 'Comment',
    className: 'track-column-comment',
    render: (track) => <TextCell value={track.comment} />,
  },
  {
    id: 'sortName',
    label: 'Sort name',
    className: 'track-column-sort-name',
    render: (track) => <TextCell value={track.sortName} />,
  },
  {
    id: 'musicBrainzId',
    label: 'MusicBrainz ID',
    className: 'technical track-column-musicbrainz',
    render: (track) => <TextCell value={track.musicBrainzId} />,
  },
];

export function TrackTable({
  tracks,
  onPlay,
  onPlayNext,
  onAddToQueue,
  detailed = false,
  sort,
  onSortChange,
  manualSorting = false,
  visibleColumns,
  onVisibleColumnsChange,
}: TrackTableProps) {
  const [internalSort, setInternalSort] = useState<TrackTableSort | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const preset = detailed ? 'detailed' : 'standard';
  const defaultColumns = detailed ? DETAILED_TRACK_COLUMNS : STANDARD_TRACK_COLUMNS;
  const storedColumns = usePlaybackStore((state) => state.trackTableColumns[preset]);
  const setStoredColumns = usePlaybackStore((state) => state.setTrackTableColumns);
  const pickerId = useId();
  const controlled = sort !== undefined;
  const activeSort = controlled ? sort : internalSort;
  const selectedColumnIds = normalizeVisibleColumns(visibleColumns ?? storedColumns);
  const selectedColumnSet = new Set(selectedColumnIds);
  const visibleColumnDefinitions = TRACK_TABLE_COLUMNS.filter((column) =>
    selectedColumnSet.has(column.id),
  );
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

  const commitVisibleColumns = (columns: readonly TrackTableColumnId[]) => {
    const next = normalizeVisibleColumns(columns);
    if (visibleColumns === undefined) setStoredColumns(preset, next);
    onVisibleColumnsChange?.(next);
  };

  const toggleColumn = (columnId: TrackTableColumnId, checked: boolean) => {
    if (columnId === 'title') return;
    commitVisibleColumns(
      checked
        ? [...selectedColumnIds, columnId]
        : selectedColumnIds.filter((id) => id !== columnId),
    );
  };

  return (
    <div className="track-table-panel">
      <div className="track-table-toolbar">
        <div className="track-column-picker">
          <button
            className="track-column-picker__trigger"
            type="button"
            aria-controls={pickerId}
            aria-expanded={columnPickerOpen}
            onClick={() => setColumnPickerOpen((open) => !open)}
          >
            Columns
            <span aria-hidden="true">▾</span>
          </button>
          {columnPickerOpen && (
            <div className="track-column-picker__menu" id={pickerId}>
              <fieldset>
                <legend>Visible columns</legend>
                <div className="track-column-picker__options">
                  {TRACK_TABLE_COLUMNS.map((column) => (
                    <label key={column.id}>
                      <input
                        type="checkbox"
                        checked={selectedColumnSet.has(column.id)}
                        disabled={column.id === 'title'}
                        onChange={(event) => toggleColumn(column.id, event.target.checked)}
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                className="track-column-picker__reset"
                type="button"
                onClick={() => commitVisibleColumns(defaultColumns)}
              >
                Reset columns
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="track-table-scroll">
        <table className={`track-table ${detailed ? 'is-detailed' : ''}`}>
          <thead>
            <tr>
              <th scope="col" aria-label="Play" />
              {visibleColumnDefinitions.map((column) =>
                column.sortKey ? (
                  <SortableHeader
                    key={column.id}
                    className={column.className}
                    label={column.label}
                    sortKey={column.sortKey}
                    sort={activeSort}
                    onSort={requestSort}
                  />
                ) : (
                  <th
                    key={column.id}
                    className={`track-static-header ${column.className ?? ''}`.trim()}
                    scope="col"
                  >
                    {column.label}
                  </th>
                ),
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
                {visibleColumnDefinitions.map((column) => (
                  <td key={column.id} className={column.className}>
                    {column.render(track)}
                  </td>
                ))}
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
                      <button
                        type="button"
                        onClick={() => onAddToQueue(track)}
                        title="Add to queue"
                      >
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
    </div>
  );
}

function normalizeVisibleColumns(columns: readonly TrackTableColumnId[]): TrackTableColumnId[] {
  const requested = new Set<TrackTableColumnId>(columns);
  requested.add('title');
  return TRACK_TABLE_COLUMNS.filter((column) => requested.has(column.id)).map(
    (column) => column.id,
  );
}

function TextCell({ value }: { value?: string | null | undefined }) {
  const label = value?.trim() || '—';
  return (
    <span className="track-cell-text" title={label === '—' ? undefined : label}>
      {label}
    </span>
  );
}

function MetadataTagLinks({ names }: { names: string[] }) {
  if (names.length === 0) return <>—</>;
  return (
    <div className="tag-list">
      {names.map((name) => (
        <TagLink key={name.toLocaleLowerCase()} name={name} />
      ))}
    </div>
  );
}

function genreNames(track: Song): string[] {
  return cleanNames([track.genre, ...(track.genres ?? []).map((genre) => genre.name)]);
}

function cleanNames(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const name = value?.trim();
    if (!name) return [];
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}

function ratingLabel(value: number | null | undefined): string {
  return value == null
    ? '—'
    : value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
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
  className?: string | undefined;
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
