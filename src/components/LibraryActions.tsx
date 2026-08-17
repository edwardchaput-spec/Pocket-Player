import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  getPlaylist,
  getPlaylists,
  replacePlaylist,
  setRating,
  setStarred,
} from '../lib/tauri/library';
import { Song } from '../lib/tauri/types';

export function FavoriteButton({
  id,
  itemType,
  starred,
  label,
}: {
  id: string;
  itemType: 'song' | 'album' | 'artist';
  starred: string | null | undefined;
  label: string;
}) {
  const client = useQueryClient();
  const [active, setActive] = useState(Boolean(starred));
  const mutation = useMutation({
    mutationFn: (next: boolean) => setStarred(id, itemType, next),
    onMutate: (next) => setActive(next),
    onError: () => setActive((value) => !value),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['profile'] }),
  });
  return (
    <button
      className={`icon-button ${active ? 'is-active' : ''}`}
      type="button"
      aria-label={`${active ? 'Remove' : 'Add'} ${label} ${active ? 'from' : 'to'} favourites`}
      aria-pressed={active}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!active)}
    >
      {active ? '★' : '☆'}
    </button>
  );
}

export function RatingControl({ id, value }: { id: string; value: number | null | undefined }) {
  const client = useQueryClient();
  const [rating, setLocalRating] = useState(value ?? 0);
  const mutation = useMutation({
    mutationFn: (next: number) => setRating(id, next),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['profile'] }),
  });
  return (
    <select
      className="rating-select"
      aria-label="Rating"
      value={rating}
      disabled={mutation.isPending}
      onChange={(event) => {
        const next = Number(event.target.value);
        setLocalRating(next);
        mutation.mutate(next);
      }}
    >
      <option value={0}>Unrated</option>
      {[1, 2, 3, 4, 5].map((item) => (
        <option key={item} value={item}>
          {item} star{item === 1 ? '' : 's'}
        </option>
      ))}
    </select>
  );
}

export function AddToPlaylistButton({ track }: { track: Song }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const playlists = useQuery({
    queryKey: ['profile', 'playlist-picker'],
    queryFn: getPlaylists,
    enabled: open,
  });
  const add = useMutation({
    mutationFn: async (playlistId: string) => {
      const playlist = await getPlaylist(playlistId);
      return replacePlaylist(playlistId, null, [
        ...playlist.songs.map((song) => song.id),
        track.id,
      ]);
    },
    onSuccess: () => {
      setOpen(false);
      void client.invalidateQueries({ queryKey: ['profile'] });
    },
  });
  return (
    <span className="playlist-picker">
      <button
        type="button"
        title="Add to playlist"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ≡+
      </button>
      {open && (
        <span className="playlist-picker-menu">
          {playlists.isPending ? (
            <small>Loading…</small>
          ) : playlists.isError ? (
            <small>{playlists.error.message}</small>
          ) : playlists.data.length === 0 ? (
            <small>No playlists</small>
          ) : (
            playlists.data.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                disabled={add.isPending}
                onClick={() => add.mutate(playlist.id)}
              >
                {playlist.name}
              </button>
            ))
          )}
        </span>
      )}
    </span>
  );
}
