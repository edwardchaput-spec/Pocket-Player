import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { EmptyState, PageHeader } from '../../components/AsyncState';
import { TrackTable } from '../../components/TrackTable';
import { generateMix, getGenres } from '../../lib/tauri/library';
import { MixInput, MixRecipe, Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';

const RECIPES: Array<[MixRecipe, string]> = [
  ['trackMix', 'Track Mix'],
  ['artistRadio', 'Artist Radio'],
  ['songRadio', 'Song Radio'],
  ['genreMix', 'Genre Mix'],
  ['decadeMix', 'Decade Mix'],
  ['recentlyAdded', 'Recently Added'],
  ['forgottenFavourites', 'Forgotten Favourites'],
  ['rediscoverYear', 'Rediscover a Year'],
  ['lowPlayDiscovery', 'Low-Play Discovery'],
];

export function MixPage({ session }: { session: Session }) {
  const [params] = useSearchParams();
  const [recipe, setRecipe] = useState<MixRecipe>(
    (params.get('recipe') as MixRecipe | null) ?? 'trackMix',
  );
  const [genre, setGenre] = useState(params.get('genre') ?? '');
  const [year, setYear] = useState(Number(params.get('year')) || new Date().getFullYear());
  const [length, setLength] = useState(50);
  const [adventure, setAdventure] = useState(0.5);
  const playback = usePlaybackStore();
  const genres = useQuery({
    queryKey: ['profile', session.profile.profileId, 'genres'],
    queryFn: getGenres,
  });
  const mix = useMutation({ mutationFn: (input: MixInput) => generateMix(input) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mix.mutate({
      recipe,
      seedTrackId: params.get('track') ?? undefined,
      seedArtistId: params.get('artist') ?? undefined,
      genre: genre || undefined,
      year,
      length,
      adventure,
    });
  };
  const tracks = mix.data?.items.map((item) => item.track) ?? [];
  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">Discovery</p>
          <h1>Track Mix</h1>
        </div>
        <p className="muted">
          A reproducible blend of favourites, underplayed tracks, related music, recent additions,
          and discovery.
        </p>
      </PageHeader>
      <form className="mix-builder" onSubmit={submit}>
        <label>
          <span>Recipe</span>
          <select value={recipe} onChange={(event) => setRecipe(event.target.value as MixRecipe)}>
            {RECIPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {recipe === 'genreMix' && (
          <label>
            <span>Genre</span>
            <select required value={genre} onChange={(event) => setGenre(event.target.value)}>
              <option value="">Choose genre</option>
              {(genres.data ?? []).map((item) => (
                <option key={item.value}>{item.value}</option>
              ))}
            </select>
          </label>
        )}
        {(recipe === 'decadeMix' || recipe === 'rediscoverYear') && (
          <label>
            <span>{recipe === 'decadeMix' ? 'Decade starting year' : 'Year'}</span>
            <input
              type="number"
              min={1900}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </label>
        )}
        <label>
          <span>Tracks: {length}</span>
          <input
            type="range"
            min={10}
            max={200}
            step={10}
            value={length}
            onChange={(event) => setLength(Number(event.target.value))}
          />
        </label>
        <label className="adventure-control">
          <span>Familiar</span>
          <input
            aria-label="Familiar to adventurous"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={adventure}
            onChange={(event) => setAdventure(Number(event.target.value))}
          />
          <span>Adventurous</span>
        </label>
        <button className="primary-button" disabled={mix.isPending}>
          {mix.isPending ? 'Building mix…' : 'Build mix'}
        </button>
      </form>
      {mix.isError && (
        <p className="message error-message" role="alert">
          {mix.error.message}
        </p>
      )}
      {mix.data && (
        <section className="mix-results">
          <header>
            <div>
              <h2>Your mix</h2>
              <p className="muted">
                Seed {mix.data.seed.slice(0, 12)} · {tracks.length} tracks
              </p>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={!tracks.length}
              onClick={() => playback.replaceAndPlay(tracks)}
            >
              Play mix
            </button>
          </header>
          {mix.data.warnings.length > 0 && (
            <ul className="mix-warnings">
              {mix.data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {tracks.length ? (
            <>
              <div className="mix-reasons">
                {mix.data.items.map((item, index) => (
                  <span key={`${item.track.id}-${index}`}>
                    <strong>{index + 1}</strong> {item.reason}
                  </span>
                ))}
              </div>
              <TrackTable
                detailed
                tracks={tracks}
                onPlay={(index) => playback.replaceAndPlay(tracks, index)}
                onPlayNext={(track) => playback.playNext([track])}
                onAddToQueue={(track) => playback.append([track])}
              />
            </>
          ) : (
            <EmptyState
              title="No mix candidates"
              detail="Refresh the track index or choose a broader recipe."
            />
          )}
        </section>
      )}
    </main>
  );
}
