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
  // Immersive: the stage covers the whole window and every other piece of
  // chrome hides until a tap or an upward swipe reveals it.
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeRevealed, setChromeRevealed] = useState(false);
  const enteredDocumentFullscreen = useRef(false);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const activeTileRef = useRef<HTMLElement>(null);
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

  // Leaving full screen from the OS (Esc, back gesture) leaves immersive too.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && enteredDocumentFullscreen.current) {
        enteredDocumentFullscreen.current = false;
        setFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // The shell hides its header, player bar and navigation while immersive.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('visualizer-immersive', fullscreen);
    root.classList.toggle('visualizer-chrome-revealed', fullscreen && chromeRevealed);
    return () => root.classList.remove('visualizer-immersive', 'visualizer-chrome-revealed');
  }, [chromeRevealed, fullscreen]);

  // Revealed controls fade away again after a few idle seconds.
  useEffect(() => {
    if (!fullscreen || !chromeRevealed || browserOpen) return;
    const timer = window.setTimeout(() => setChromeRevealed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [browserOpen, chromeRevealed, fullscreen]);

  useEffect(
    () => () => {
      if (enteredDocumentFullscreen.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => {
    if (browserOpen) {
      activeTileRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
    }
  }, [browserOpen]);

  const toggleFullscreen = useCallback(async () => {
    const entering = !fullscreen;
    setFullscreen(entering);
    setChromeRevealed(false);
    setBrowserOpen(false);
    // Document-level full screen (best effort) hides the OS bars while the
    // app's own navigation stays available to reveal.
    try {
      if (entering && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
        enteredDocumentFullscreen.current = Boolean(document.fullscreenElement);
      } else if (!entering && enteredDocumentFullscreen.current && document.fullscreenElement) {
        enteredDocumentFullscreen.current = false;
        await document.exitFullscreen();
      }
    } catch {
      /* The webview may refuse; the in-app immersive layout still applies. */
    }
    if (entering) stageRef.current?.focus();
  }, [fullscreen]);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!fullscreen) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, select, a, .visualizer-browser, .visualizer-toolbar'))
      return;
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    gesture.current = null;
    if (!fullscreen || start?.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const swipe = 48;
    if (Math.abs(dx) > swipe && Math.abs(dx) > Math.abs(dy)) {
      move(dx < 0 ? 1 : -1);
    } else if (dy < -swipe) {
      setChromeRevealed(true);
    } else if (dy > swipe) {
      setChromeRevealed(false);
      setBrowserOpen(false);
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      setChromeRevealed((revealed) => !revealed);
      setBrowserOpen(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void toggleFullscreen();
    } else if (event.key === 'Escape' && fullscreen) {
      event.preventDefault();
      void toggleFullscreen();
    } else if (event.key === 'ArrowUp' && fullscreen) {
      event.preventDefault();
      setChromeRevealed(true);
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
      className={[
        'visualizer-stage',
        browserOpen ? 'has-browser' : '',
        fullscreen ? 'is-immersive' : '',
        fullscreen && chromeRevealed ? 'is-revealed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        gesture.current = null;
      }}
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
      {fullscreen && !chromeRevealed && (
        <p className="visualizer-immersive-hint" aria-hidden="true">
          Tap or swipe up for controls · swipe sideways to change scene
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
          {currentPreset.name} · Scenes
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
          <div
            className="visualizer-preset-grid"
            aria-label="Scenes: swipe to browse, tap to choose"
          >
            {visiblePresets.map((preset) => (
              <article
                key={preset.id}
                ref={player.visualizer === preset.id ? activeTileRef : undefined}
                className={player.visualizer === preset.id ? 'is-active' : ''}
              >
                <button
                  type="button"
                  className="preset-main"
                  aria-pressed={player.visualizer === preset.id}
                  onClick={() => player.setVisualizer(preset.id)}
                >
                  <span
                    className={`preset-swatch preset-swatch-${preset.id} preset-swatch-category-${preset.category.replace(/[^a-z]/gi, '').toLowerCase()}`}
                  />
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
            Auto rotation uses favourites when you have any. In full screen, tap or swipe up for
            controls and swipe sideways (or ←/→) to change scenes; press F or Esc to leave.
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
