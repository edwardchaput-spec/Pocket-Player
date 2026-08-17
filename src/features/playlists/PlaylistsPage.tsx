import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { createPlaylist, getPlaylists } from '../../lib/tauri/library';
import { Session } from '../../lib/tauri/types';

export function PlaylistsPage({ session }: { session: Session }) {
  const [name, setName] = useState('');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'playlists'],
    queryFn: getPlaylists,
  });
  const create = useMutation({
    mutationFn: (value: string) => createPlaylist(value),
    onSuccess: () => {
      setName('');
      void client.invalidateQueries({
        queryKey: ['profile', session.profile.profileId, 'playlists'],
      });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  };
  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">Library</p>
          <h1>Playlists</h1>
        </div>
        <form className="create-playlist" onSubmit={submit}>
          <label>
            <span className="sr-only">New playlist name</span>
            <input
              value={name}
              maxLength={200}
              placeholder="New playlist name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
      </PageHeader>
      {create.isError && (
        <p className="message error-message" role="alert">
          {create.error.message}
        </p>
      )}
      {query.isPending ? (
        <div className="state-panel">
          <p>Loading playlists…</p>
        </div>
      ) : query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState title="No playlists" detail="Create a playlist to collect tracks." />
      ) : (
        <div className="playlist-grid">
          {query.data.map((playlist) => (
            <Link
              className="playlist-card"
              key={playlist.id}
              to={`/playlists/${encodeURIComponent(playlist.id)}`}
            >
              <span aria-hidden="true">≡</span>
              <div>
                <strong>{playlist.name}</strong>
                <small>
                  {playlist.songCount ?? 0} tracks · {Math.round((playlist.duration ?? 0) / 60)} min
                </small>
                {playlist.comment && <p>{playlist.comment}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
