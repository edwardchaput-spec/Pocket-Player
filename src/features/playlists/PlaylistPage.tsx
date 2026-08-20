import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { EmptyState, ErrorState } from '../../components/AsyncState';
import { TrackTable } from '../../components/TrackTable';
import { AlbumLink, ArtistLink } from '../../components/LibraryLinks';
import { deletePlaylist, getPlaylist, replacePlaylist } from '../../lib/tauri/library';
import { PlaylistDetail, Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';

export function PlaylistPage({ session }: { session: Session }) {
  const { playlistId = '' } = useParams();
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'playlist', playlistId],
    queryFn: () => getPlaylist(playlistId),
    enabled: Boolean(playlistId),
  });
  if (!playlistId)
    return <EmptyState title="Playlist not found" detail="The playlist address is invalid." />;
  if (query.isPending)
    return (
      <main className="page-content">
        <div className="state-panel">Loading playlist…</div>
      </main>
    );
  if (query.isError)
    return (
      <main className="page-content">
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      </main>
    );
  return (
    <PlaylistContent
      key={`${query.data.id}-${query.data.changed ?? ''}`}
      playlist={query.data}
      session={session}
    />
  );
}

function PlaylistContent({ playlist, session }: { playlist: PlaylistDetail; session: Session }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const playback = usePlaybackStore();
  const [name, setName] = useState(playlist.name);
  const [songs, setSongs] = useState(playlist.songs);
  const save = useMutation({
    mutationFn: () =>
      replacePlaylist(
        playlist.id,
        name.trim(),
        songs.map((song) => song.id),
      ),
    onSuccess: (updated) => {
      setSongs(updated.songs);
      client.setQueryData(['profile', session.profile.profileId, 'playlist', playlist.id], updated);
      void client.invalidateQueries({
        queryKey: ['profile', session.profile.profileId, 'playlists'],
      });
    },
  });
  const remove = useMutation({
    mutationFn: () => deletePlaylist(playlist.id),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ['profile', session.profile.profileId, 'playlists'],
      });
      void navigate('/playlists');
    },
  });
  const dirty =
    name !== playlist.name ||
    songs.map((song) => song.id).join('\u001f') !==
      playlist.songs.map((song) => song.id).join('\u001f');
  const moveSong = (from: number, to: number) => {
    if (to < 0 || to >= songs.length) return;
    const next = [...songs];
    const [song] = next.splice(from, 1);
    if (song) {
      next.splice(to, 0, song);
      setSongs(next);
    }
  };
  return (
    <main className="page-content">
      <header className="detail-heading">
        <div>
          <p className="eyebrow">Playlist</p>
          <input
            className="title-input"
            aria-label="Playlist name"
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="muted">{songs.length} tracks</p>
        </div>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            disabled={!songs.length}
            onClick={() => playback.replaceAndPlay(songs)}
          >
            Play
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!name.trim() || !dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Delete “${playlist.name}”?`)) remove.mutate();
            }}
          >
            Delete
          </button>
        </div>
      </header>
      {(save.isError || remove.isError) && (
        <p className="message error-message" role="alert">
          {save.error?.message ?? remove.error?.message}
        </p>
      )}
      {songs.length ? (
        <>
          <TrackTable
            tracks={songs}
            onPlay={(index, displayedTracks) => playback.replaceAndPlay(displayedTracks, index)}
            onPlayNext={(track) => playback.playNext([track])}
            onAddToQueue={(track) => playback.append([track])}
          />
          <section className="playlist-editor">
            <h2>Edit order</h2>
            <p className="muted">
              Use the buttons for keyboard-accessible reordering, then save changes.
            </p>
            <ol>
              {songs.map((song, index) => (
                <li key={`${song.id}-${index}`}>
                  <span>
                    <strong>{song.title}</strong>
                    <small className="library-inline-links">
                      <ArtistLink
                        artistId={song.artistId}
                        name={song.displayArtist ?? song.artist}
                      />
                      {' · '}
                      <AlbumLink albumId={song.albumId} name={song.album} />
                    </small>
                  </span>
                  <span>
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={`Move ${song.title} up`}
                      onClick={() => moveSong(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === songs.length - 1}
                      aria-label={`Move ${song.title} down`}
                      onClick={() => moveSong(index, index + 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${song.title}`}
                      onClick={() =>
                        setSongs((items) => items.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <EmptyState title="Empty playlist" detail="Add tracks from search or the track library." />
      )}
    </main>
  );
}
