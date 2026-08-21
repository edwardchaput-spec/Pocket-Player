import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlaybackStore } from '../features/player/playbackStore';
import { Song } from '../lib/tauri/types';
import {
  DETAILED_TRACK_COLUMNS,
  STANDARD_TRACK_COLUMNS,
  TrackTable,
  type TrackTableColumnId,
  TrackTableSort,
} from './TrackTable';

const tracks: Song[] = [
  {
    id: 'opaque:zulu',
    title: 'Zulu',
    artist: 'Artist B',
    album: 'Album 2',
    duration: 180,
    suffix: 'mp3',
    samplingRate: 48_000,
    bitRate: 320,
    size: 8 * 1024 * 1024,
    musicBrainzId: 'musicbrainz:zulu',
  },
  {
    id: 'opaque:alpha',
    title: 'Alpha',
    artist: 'Artist A',
    album: 'Album 1',
    duration: 240,
    suffix: 'flac',
    samplingRate: 44_100,
    bitDepth: 24,
    channelCount: 2,
    bitRate: 1_411,
    size: 42 * 1024 * 1024,
  },
  {
    id: 'opaque:middle',
    title: 'Middle',
    artist: 'Artist C',
    album: 'Album 3',
    duration: null,
  },
];

describe('TrackTable', () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      trackTableColumns: {
        standard: [...STANDARD_TRACK_COLUMNS],
        detailed: [...DETAILED_TRACK_COLUMNS],
      },
    });
  });

  it('preserves the standard and detailed default column sets', () => {
    const standard = renderTrackTable({});
    expect(STANDARD_TRACK_COLUMNS).toEqual(['title', 'artist', 'album', 'duration']);
    expect(renderedColumnLabels()).toEqual([
      'Play',
      'Title',
      'Artist',
      'Album',
      'Length',
      'Actions',
    ]);

    standard.unmount();
    renderTrackTable({ detailed: true });
    expect(DETAILED_TRACK_COLUMNS).toEqual([
      'title',
      'artist',
      'album',
      'tags',
      'duration',
      'playCount',
      'rating',
      'format',
      'bitRate',
      'size',
    ]);
    expect(renderedColumnLabels()).toEqual([
      'Play',
      'Title',
      'Artist',
      'Album',
      'Tags',
      'Length',
      'Plays',
      'Rating',
      'Format',
      'Bitrate',
      'Size',
      'Actions',
    ]);
  });

  it('makes every displayed data column sortable and splits technical metadata', () => {
    renderTrackTable({ detailed: true });

    for (const label of [
      'Title',
      'Artist',
      'Album',
      'Tags',
      'Length',
      'Plays',
      'Rating',
      'Format',
      'Bitrate',
      'Size',
    ]) {
      const button = screen.getByRole('button', { name: new RegExp(`^Sort by ${label}`) });
      expect(button.closest('th')).toHaveAttribute('aria-sort', 'none');
    }

    expect(screen.queryByRole('columnheader', { name: 'Technical' })).not.toBeInTheDocument();
    expect(screen.getByText('FLAC 44.1 kHz · 24-bit · 2 ch')).toBeInTheDocument();
    expect(screen.getByText('1,411 kbps')).toBeInTheDocument();
    expect(screen.getByText('42.0 MB')).toBeInTheDocument();
  });

  it('adds a rich metadata column from the accessible column picker', async () => {
    const user = userEvent.setup();
    renderTrackTable({});

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    const musicBrainz = screen.getByRole('checkbox', { name: 'MusicBrainz ID' });
    expect(musicBrainz).not.toBeChecked();
    await user.click(musicBrainz);

    expect(screen.getByRole('columnheader', { name: 'MusicBrainz ID' })).toBeInTheDocument();
    expect(screen.getByText('musicbrainz:zulu')).toBeInTheDocument();
  });

  it('can hide a default column while retaining title, play, and actions', async () => {
    const user = userEvent.setup();
    renderTrackTable({});

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    expect(screen.getByRole('checkbox', { name: 'Title' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Artist' }));

    expect(renderedColumnLabels()).toEqual(['Play', 'Title', 'Album', 'Length', 'Actions']);
    expect(screen.getByRole('button', { name: /^Sort by Title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Zulu' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('resets column changes to the active default preset', async () => {
    const user = userEvent.setup();
    renderTrackTable({});

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Artist' }));
    await user.click(screen.getByRole('checkbox', { name: 'Year' }));
    expect(renderedColumnLabels()).toEqual(['Play', 'Title', 'Album', 'Year', 'Length', 'Actions']);

    await user.click(screen.getByRole('button', { name: 'Reset columns' }));
    expect(renderedColumnLabels()).toEqual([
      'Play',
      'Title',
      'Artist',
      'Album',
      'Length',
      'Actions',
    ]);
  });

  it('keeps a column choice when the table is reopened during the session', async () => {
    const user = userEvent.setup();
    const first = renderTrackTable({});

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Year' }));
    first.unmount();

    renderTrackTable({});
    expect(screen.getByRole('columnheader', { name: 'Year' })).toBeInTheDocument();
  });

  it('sorts stably and hands playback the displayed order and clicked index', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    renderTrackTable({ onPlay });

    const titleSort = screen.getByRole('button', { name: /^Sort by Title/ });
    await user.click(titleSort);

    expect(titleSort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    expect(renderedTitles()).toEqual(['Alpha', 'Middle', 'Zulu']);

    await user.click(screen.getByRole('button', { name: 'Play Zulu' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    const [index, displayedTracks] = (onPlay.mock.calls[0] ?? []) as [number, Song[]];
    expect(index).toBe(2);
    expect(displayedTracks.map((track) => track.id)).toEqual([
      'opaque:alpha',
      'opaque:middle',
      'opaque:zulu',
    ]);
  });

  it('keeps equal values in source order for deterministic sorting', async () => {
    const user = userEvent.setup();
    const equalTitles: Song[] = [
      { id: 'opaque:first', title: 'Same', artist: 'First artist' },
      { id: 'opaque:second', title: 'Same', artist: 'Second artist' },
    ];
    renderTrackTable({ tableTracks: equalTitles });
    const titleSort = screen.getByRole('button', { name: /^Sort by Title/ });

    await user.click(titleSort);
    expect(renderedArtists()).toEqual(['First artist', 'Second artist']);

    await user.click(titleSort);
    expect(renderedArtists()).toEqual(['First artist', 'Second artist']);
  });

  it('sorts the combined format value by codec and sample rate', async () => {
    const user = userEvent.setup();
    const highResolution: Song = {
      ...tracks[1]!,
      id: 'opaque:high-resolution',
      title: 'High resolution',
      samplingRate: 96_000,
    };
    renderTrackTable({ detailed: true, tableTracks: [highResolution, tracks[1]!] });
    const formatSort = screen.getByRole('button', { name: /^Sort by Format/ });

    await user.click(formatSort);
    expect(renderedTitles()).toEqual(['Alpha', 'High resolution']);

    await user.click(formatSort);
    expect(renderedTitles()).toEqual(['High resolution', 'Alpha']);
  });

  it('keeps missing numeric values last in both directions', async () => {
    const user = userEvent.setup();
    renderTrackTable({});
    const lengthSort = screen.getByRole('button', { name: /^Sort by Length/ });

    await user.click(lengthSort);
    expect(renderedTitles()).toEqual(['Zulu', 'Alpha', 'Middle']);

    await user.click(lengthSort);
    expect(lengthSort.closest('th')).toHaveAttribute('aria-sort', 'descending');
    expect(renderedTitles()).toEqual(['Alpha', 'Zulu', 'Middle']);
  });

  it('delegates controlled sorting without reordering a manually sorted result', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const sort: TrackTableSort = { key: 'title', direction: 'ascending' };
    renderTrackTable({ sort, manualSorting: true, onSortChange });

    expect(renderedTitles()).toEqual(['Zulu', 'Alpha', 'Middle']);
    await user.click(screen.getByRole('button', { name: /^Sort by Title/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'title', direction: 'descending' });
  });
});

function renderTrackTable({
  detailed = false,
  onPlay = vi.fn(),
  sort,
  manualSorting,
  onSortChange,
  visibleColumns,
  onVisibleColumnsChange,
  tableTracks = tracks,
}: {
  detailed?: boolean;
  onPlay?: (index: number, displayedTracks: Song[]) => void;
  sort?: TrackTableSort;
  manualSorting?: boolean;
  onSortChange?: (sort: TrackTableSort) => void;
  visibleColumns?: readonly TrackTableColumnId[];
  onVisibleColumnsChange?: (columns: TrackTableColumnId[]) => void;
  tableTracks?: Song[];
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TrackTable
          detailed={detailed}
          tracks={tableTracks}
          onPlay={onPlay}
          sort={sort}
          manualSorting={manualSorting}
          onSortChange={onSortChange}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={onVisibleColumnsChange}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderedColumnLabels(): string[] {
  return [...screen.getByRole('table').querySelectorAll('thead th')].map((header) => {
    const structuralLabel = header.getAttribute('aria-label');
    if (structuralLabel) return structuralLabel;
    return (
      header.querySelector<HTMLSpanElement>('.track-sort-button > span:first-child')?.textContent ??
      header.textContent?.trim() ??
      ''
    );
  });
}

function renderedTitles(): string[] {
  return [...screen.getByRole('table').querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('td:nth-child(2) strong')?.textContent?.trim() ?? '',
  );
}

function renderedArtists(): string[] {
  return [...screen.getByRole('table').querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('td:nth-child(3)')?.textContent?.trim() ?? '',
  );
}
