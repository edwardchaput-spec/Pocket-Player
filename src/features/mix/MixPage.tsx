import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { EmptyState, PageHeader } from '../../components/AsyncState';
import { TrackTable } from '../../components/TrackTable';
import { generateMix, getGenres, getTags } from '../../lib/tauri/library';
import { MixInput, MixRecipe, Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';
import './MixPage.css';

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
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const playback = usePlaybackStore();
  const genres = useQuery({
    queryKey: ['profile', session.profile.profileId, 'genres'],
    queryFn: getGenres,
  });
  const tags = useQuery({
    queryKey: ['profile', session.profile.profileId, 'tags'],
    queryFn: getTags,
  });
  const indexedTags = tags.data ?? [];
  const moodTags = indexedTags.filter((item) => item.categories.includes('Mood'));
  const visibleTags = moodTags.length > 0 ? moodTags : indexedTags;
  const showingGenreFallback = indexedTags.length > 0 && moodTags.length === 0;
  const mix = useMutation({ mutationFn: (input: MixInput) => generateMix(input) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const tagCategories = new Map(indexedTags.map((item) => [item.name, item.categories]));
    const genreTags: string[] = [];
    const nonGenreTags: string[] = [];
    for (const tag of excludedTags) {
      const categories = tagCategories.get(tag);
      if (categories?.includes('Genre')) genreTags.push(tag);
      if (!categories || categories.includes('Mood')) nonGenreTags.push(tag);
    }
    mix.mutate({
      recipe,
      seedTrackId: params.get('track') ?? undefined,
      seedArtistId: params.get('artist') ?? undefined,
      genre: genre || undefined,
      year,
      length,
      adventure,
      excludedGenres: [...new Set([...excludedGenres, ...genreTags])],
      excludedTags: nonGenreTags,
    });
  };
  const toggleExcludedTag = (tag: string, checked: boolean) => {
    setExcludedTags((current) =>
      checked ? [...new Set([...current, tag])] : current.filter((item) => item !== tag),
    );
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
          <span>Exclude genres</span>
          <select
            multiple
            value={excludedGenres}
            onChange={(event) =>
              setExcludedGenres([...event.target.selectedOptions].map((option) => option.value))
            }
          >
            {(genres.data ?? []).map((item) => (
              <option key={item.value} value={item.value}>
                {item.value}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="mix-tag-field">
          <legend>Exclude tags</legend>
          {tags.isPending ? (
            <div className="mix-tag-state" role="status">
              Loading indexed tags…
            </div>
          ) : tags.isError ? (
            <div className="mix-tag-state is-error">
              <span role="alert">Could not load tags: {tags.error.message}</span>
              <button type="button" onClick={() => void tags.refetch()}>
                Retry
              </button>
            </div>
          ) : visibleTags.length === 0 ? (
            <div className="mix-tag-state">No indexed genre or mood tags were found.</div>
          ) : (
            <div className="mix-tag-options">
              {visibleTags.map((item) => {
                const categories = item.categories.join(' + ');
                return (
                  <label className="mix-tag-option" key={item.name.toLocaleLowerCase()}>
                    <input
                      aria-label={`Exclude ${item.name} (${categories})`}
                      type="checkbox"
                      checked={excludedTags.includes(item.name)}
                      onChange={(event) => toggleExcludedTag(item.name, event.target.checked)}
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {categories} · {item.songCount.toLocaleString()}{' '}
                        {item.songCount === 1 ? 'track' : 'tracks'}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <small className="mix-field-hint">
            {showingGenreFallback
              ? 'This library has genre-classified tags only; Genre entries mirror the list above.'
              : 'Mood tags come from the local library index; dual-category entries are marked.'}
          </small>
        </fieldset>
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
        <label className="mix-adventure-control">
          <span className="mix-range-legend">
            <span>Familiar</span>
            <span>Adventurous</span>
          </span>
          <input
            aria-label="Familiar to adventurous"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={adventure}
            onChange={(event) => setAdventure(Number(event.target.value))}
          />
        </label>
        <button className="primary-button mix-build-button" type="submit" disabled={mix.isPending}>
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
                onPlay={(index, displayedTracks) => playback.replaceAndPlay(displayedTracks, index)}
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
