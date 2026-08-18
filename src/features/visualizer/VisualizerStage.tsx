import { useCallback, useEffect, useRef, useState } from 'react';

import { Artwork } from '../../components/Artwork';
import { Session, Song } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';
import { VisualizerCanvas, VisualizerDiagnostics } from './VisualizerCanvas';
import {
  nextVisualizerMode,
  presetFor,
  VISUALIZER_CATEGORIES,
  VISUALIZER_MODES,
  VISUALIZER_PRESETS,
  VisualizerCategory,
  VisualizerMode,
} from './visualizerPresets';

export function VisualizerStage({ session, track }: { session: Session; track: Song }) {
  const player = usePlaybackStore();
  const stageRef = useRef<HTMLElement>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [category, setCategory] = useState<'All' | VisualizerCategory>('All');
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<VisualizerDiagnostics | null>(null);
  const currentPreset = presetFor(player.visualizer);
  const artworkUrl = track.coverArt
    ? `${session.proxyBaseUrl}/cover/${encodeURIComponent(track.coverArt)}?size=900`
    : undefined;
  const move = useCallback((direction: 1 | -1) => {
    const playback = usePlaybackStore.getState();
    const rotationCandidates = playback.visualizerFavorites.length
      ? playback.visualizerFavorites
      : [...VISUALIZER_MODES];
    if (direction === 1) {
      playback.setVisualizer(
        nextVisualizerMode(playback.visualizer, rotationCandidates, playback.visualizerRandomMode),
      );
      return;
    }
    const current = rotationCandidates.indexOf(playback.visualizer);
    const previous =
      rotationCandidates[(current - 1 + rotationCandidates.length) % rotationCandidates.length] ??
      rotationCandidates.at(-1);
    if (previous) playback.setVisualizer(previous);
  }, []);

  useEffect(() => {
    if (!player.visualizerAutoRotate) return;
    const timer = window.setInterval(() => move(1), player.visualizerRotationSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [move, player.visualizerAutoRotate, player.visualizerRotationSeconds]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setFullscreen(active);
      if (!active) setBrowserOpen(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    setFullscreenError(null);
    try {
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      setFullscreenError('Windows or WebView2 did not allow full screen. Try the button again.');
    }
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void toggleFullscreen();
    } else if (event.key === 'ArrowRight' && fullscreen) {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft' && fullscreen) {
      event.preventDefault();
      move(-1);
    }
  };

  const visiblePresets =
    category === 'All'
      ? VISUALIZER_PRESETS
      : VISUALIZER_PRESETS.filter((preset) => preset.category === category);

  return (
    <section
      ref={stageRef}
      className={`visualizer-stage ${browserOpen ? 'has-browser' : ''}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Music visualizer"
    >
      <Artwork
        className="now-playing-art"
        proxyBaseUrl={session.proxyBaseUrl}
        coverId={track.coverArt}
        alt=""
        size={900}
      />
      <SmoothVisualizer
        mode={player.visualizer}
        quality={player.visualizerQuality}
        sensitivity={player.visualizerSensitivity}
        artworkUrl={artworkUrl}
        seedKey={`${track.id}:${track.albumId ?? ''}`}
        active={player.status === 'playing'}
        onDiagnostics={setDiagnostics}
      />
      <div className="visualizer-headline">
        <span>{currentPreset.category}</span>
        <strong>{currentPreset.name}</strong>
        <small>{currentPreset.description}</small>
      </div>
      {fullscreenError && (
        <p className="visualizer-error" role="status">
          {fullscreenError}
        </p>
      )}
      <div className="visualizer-toolbar" aria-label="Visualizer controls">
        <button type="button" onClick={() => move(-1)} aria-label="Previous visualizer">
          ‹
        </button>
        <button
          type="button"
          className="visualizer-preset-button"
          aria-expanded={browserOpen}
          onClick={() => setBrowserOpen((open) => !open)}
        >
          {currentPreset.name} · Browse
        </button>
        <button
          type="button"
          className={player.visualizerFavorites.includes(player.visualizer) ? 'is-active' : ''}
          aria-label={
            player.visualizerFavorites.includes(player.visualizer)
              ? 'Remove preset from favourites'
              : 'Add preset to favourites'
          }
          aria-pressed={player.visualizerFavorites.includes(player.visualizer)}
          onClick={() => player.toggleVisualizerFavorite(player.visualizer)}
        >
          ★
        </button>
        <button type="button" onClick={() => move(1)} aria-label="Next visualizer">
          ›
        </button>
        <button
          type="button"
          className={player.visualizerAutoRotate ? 'is-active' : ''}
          aria-pressed={player.visualizerAutoRotate}
          onClick={() => player.setVisualizerAutoRotate(!player.visualizerAutoRotate)}
        >
          Auto
        </button>
        <button
          type="button"
          className={player.visualizerRandomMode ? 'is-active' : ''}
          aria-pressed={player.visualizerRandomMode}
          onClick={() => player.setVisualizerRandomMode(!player.visualizerRandomMode)}
        >
          Random
        </button>
        <button type="button" onClick={() => void toggleFullscreen()}>
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
      {browserOpen && (
        <aside className="visualizer-browser" aria-label="Visualizer preset browser">
          <header>
            <div>
              <p className="eyebrow">Visual laboratory</p>
              <h2>Choose a scene</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close preset browser"
              onClick={() => setBrowserOpen(false)}
            >
              ×
            </button>
          </header>
          <div className="visualizer-categories" role="group" aria-label="Preset categories">
            {VISUALIZER_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? 'is-active' : ''}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="visualizer-preset-grid">
            {visiblePresets.map((preset) => (
              <article
                key={preset.id}
                className={player.visualizer === preset.id ? 'is-active' : ''}
              >
                <button
                  type="button"
                  className="preset-main"
                  onClick={() => player.setVisualizer(preset.id)}
                >
                  <span className={`preset-swatch preset-swatch-${preset.id}`} />
                  <strong>{preset.name}</strong>
                  <small>{preset.description}</small>
                </button>
                <button
                  type="button"
                  className={`preset-favourite ${player.visualizerFavorites.includes(preset.id) ? 'is-active' : ''}`}
                  aria-label={`${player.visualizerFavorites.includes(preset.id) ? 'Remove' : 'Add'} ${preset.name} ${player.visualizerFavorites.includes(preset.id) ? 'from' : 'to'} favourites`}
                  onClick={() => player.toggleVisualizerFavorite(preset.id)}
                >
                  ★
                </button>
              </article>
            ))}
          </div>
          <div className="visualizer-settings-grid">
            <label>
              <span>
                Sensitivity <output>{player.visualizerSensitivity.toFixed(2)}×</output>
              </span>
              <input
                type="range"
                min="0.35"
                max="2.5"
                step="0.05"
                value={player.visualizerSensitivity}
                onChange={(event) => player.setVisualizerSensitivity(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Quality</span>
              <select
                value={player.visualizerQuality}
                onChange={(event) => player.setVisualizerQuality(Number(event.target.value))}
              >
                <option value={1}>Low</option>
                <option value={2}>Balanced</option>
                <option value={3}>High</option>
              </select>
            </label>
            <label>
              <span>Rotate every</span>
              <select
                value={player.visualizerRotationSeconds}
                onChange={(event) =>
                  player.setVisualizerRotationSeconds(Number(event.target.value))
                }
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
              </select>
            </label>
          </div>
          <p className="visualizer-hint">
            Auto rotation uses favourites when you have any. Press F for full screen and use ←/→ to
            change scenes.
          </p>
          {diagnostics && (
            <p className="visualizer-performance" aria-live="polite">
              <strong>{diagnostics.backend}</strong>
              {' · '}
              {diagnostics.renderer ?? 'browser-managed renderer'}
              {' · '}
              {diagnostics.suspended
                ? 'sleeping while paused or hidden'
                : `${diagnostics.fpsLimit} FPS ceiling${diagnostics.adaptiveLevel ? ` · adaptive level ${diagnostics.adaptiveLevel}` : ''}`}
            </p>
          )}
        </aside>
      )}
    </section>
  );
}

function SmoothVisualizer({
  mode,
  quality,
  onDiagnostics,
  ...props
}: Omit<React.ComponentProps<typeof VisualizerCanvas>, 'mode'> & { mode: VisualizerMode }) {
  const [layers, setLayers] = useState<{
    active: VisualizerMode;
    previous: VisualizerMode | null;
  }>({ active: mode, previous: null });
  if (mode !== layers.active) setLayers({ active: mode, previous: layers.active });
  useEffect(() => {
    if (!layers.previous) return;
    const timer = window.setTimeout(
      () => setLayers((current) => ({ ...current, previous: null })),
      650,
    );
    return () => window.clearTimeout(timer);
  }, [layers.previous]);
  return (
    <div className="visualizer-layers" aria-live="off">
      {layers.previous && (
        <VisualizerCanvas
          key={layers.previous}
          mode={layers.previous}
          quality={quality}
          {...props}
          active={false}
          className="visualizer-layer visualizer-layer-out"
        />
      )}
      <VisualizerCanvas
        key={layers.active}
        mode={layers.active}
        quality={quality}
        {...props}
        onDiagnostics={onDiagnostics}
        className="visualizer-layer visualizer-layer-in"
      />
    </div>
  );
}
