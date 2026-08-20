import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  recordPlaybackEvent,
  reportScrobble,
  savePlayerSettings,
  saveQueueSnapshot,
  syncPlayQueue,
} from '../../lib/tauri/playback';
import { Session } from '../../lib/tauri/types';
import { AlbumLink, ArtistLink } from '../../components/LibraryLinks';
import {
  currentDesktopWindow,
  emitPlaybackState,
  listenDesktopControl,
  openMiniPlayer,
  showTrackNotification,
} from '../../lib/tauri/desktop';
import { currentQueueItem, type PlaybackStatus, usePlaybackStore } from './playbackStore';
import { ScrobbleController } from './ScrobbleController';
import { AudioAnalysisProvider } from './AudioAnalysisContext';
import { applyCustomThemeColors } from '../settings/themeColors';
import { QueuePopover } from '../queue/QueuePopover';

export function PlayerProvider({ children, session }: PropsWithChildren<{ session: Session }>) {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const reporterRef = useRef<ScrobbleController | null>(null);
  const pendingSeekRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const notifiedPlaybackSessionRef = useRef<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const state = usePlaybackStore();
  const current = currentQueueItem(state);

  useEffect(() => {
    state.initializeSettings(session.playerSettings);
    if (state.queue.length === 0 && session.queueSnapshot?.items.length) {
      state.hydrateQueue(session.queueSnapshot);
    }
    // The persisted values are initialization input for the process session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.profile.profileId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.crossOrigin = 'anonymous';
    const reporter = current
      ? new ScrobbleController(
          (submission) =>
            reportScrobble({
              playbackSessionId: current.playbackSessionId,
              trackId: current.track.id,
              submission,
            }),
          (submission, listenedSeconds) => {
            void recordPlaybackEvent({
              eventId: crypto.randomUUID(),
              profileId: session.profile.profileId,
              playbackSessionId: current.playbackSessionId,
              trackId: current.track.id,
              eventType: submission ? 'completed' : 'now_playing',
              position: audioRef.current?.currentTime ?? 0,
              listenedMs: Math.round(listenedSeconds * 1000),
              sourceContext: 'queue',
            }).catch(() => undefined);
          },
        )
      : null;
    reporterRef.current = reporter;
    if (!current) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    const shouldStartPlaying = state.status === 'loading';
    pendingSeekRef.current = state.position;
    audio.src = `${session.proxyBaseUrl}/stream/${encodeURIComponent(current.track.id)}`;
    audio.load();
    if (shouldStartPlaying) {
      void audio.play().catch(() => {
        state.setStatus('paused');
      });
    } else {
      // A restored queue is useful startup state, not a request to resume playback.
      audio.pause();
      state.setStatus('paused');
    }
    return () => {
      reporter?.stopped(performance.now());
      if (reporter && reporter.listened() >= 5 && !reporter.isCompletedOrPending()) {
        void recordPlaybackEvent({
          eventId: crypto.randomUUID(),
          profileId: session.profile.profileId,
          playbackSessionId: current.playbackSessionId,
          trackId: current.track.id,
          eventType: 'skipped',
          position: audio.currentTime || 0,
          listenedMs: Math.round(reporter.listened() * 1000),
          sourceContext: 'queue',
        }).catch(() => undefined);
      }
    };
    // Store actions are stable and the current occurrence is the source boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.playbackSessionId, session.proxyBaseUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = state.volume;
    audio.muted = state.muted;
    const timer = window.setTimeout(() => {
      void savePlayerSettings({
        volume: state.volume,
        muted: state.muted,
        visualizer: state.visualizer,
        visualizerQuality: state.visualizerQuality,
        visualizerSensitivity: state.visualizerSensitivity,
        visualizerAutoRotate: state.visualizerAutoRotate,
        visualizerRotationSeconds: state.visualizerRotationSeconds,
        visualizerRandomMode: state.visualizerRandomMode,
        visualizerFavorites: state.visualizerFavorites,
        theme: state.theme,
        customColors: state.customColors,
        density: state.density,
        notifications: state.notifications,
        closeToTray: state.closeToTray,
        homeSections: state.homeSections,
        pinnedPlaylistIds: state.pinnedPlaylistIds,
      }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    state.volume,
    state.muted,
    state.visualizer,
    state.visualizerQuality,
    state.visualizerSensitivity,
    state.visualizerAutoRotate,
    state.visualizerRotationSeconds,
    state.visualizerRandomMode,
    state.visualizerFavorites,
    state.theme,
    state.customColors,
    state.density,
    state.notifications,
    state.closeToTray,
    state.homeSections,
    state.pinnedPlaylistIds,
  ]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.dataset.density = state.density;
    applyCustomThemeColors(document.documentElement.style, state.customColors);
  }, [state.theme, state.customColors, state.density]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenDesktopControl((control) => {
      const audio = audioRef.current;
      const playback = usePlaybackStore.getState();
      if (control.action === 'open-mini') {
        void openMiniPlayer();
      } else if (control.action === 'show-main') {
        void currentDesktopWindow().show();
        void currentDesktopWindow().setFocus();
      } else if (
        control.action === 'navigate-main' &&
        control.route &&
        /^\/(artists|albums)\/[^/]+$/.test(control.route)
      ) {
        void navigate(control.route);
        void currentDesktopWindow().show();
        void currentDesktopWindow().setFocus();
      } else if (control.action === 'previous') {
        playback.previous();
      } else if (control.action === 'next') {
        playback.next('manual');
      } else if (control.action === 'play-pause') {
        if (isPlaybackActive(playback.status)) pauseAudio(audio, playback);
        else if (audio) playAudio(audio, playback);
      } else if (control.action === 'play' && audio?.paused) {
        playAudio(audio, playback);
      } else if (control.action === 'pause') {
        pauseAudio(audio, playback);
      } else if (control.action === 'seek' && audio && control.value != null) {
        const knownDuration = Number.isFinite(audio.duration) ? audio.duration : playback.duration;
        const position = Math.max(0, Math.min(control.value, knownDuration || control.value));
        audio.currentTime = position;
        playback.setTiming(position, knownDuration || 0);
      } else if (control.action === 'volume' && control.value != null) {
        playback.setVolume(control.value);
      } else if (control.action === 'mute' && control.muted != null) {
        playback.setMuted(control.muted);
      }
      if (control.action === 'mini-ready') void publishPlaybackState(session.proxyBaseUrl);
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [navigate, session.proxyBaseUrl]);

  useEffect(() => {
    void publishPlaybackState(session.proxyBaseUrl);
  }, [
    current?.occurrenceId,
    session.proxyBaseUrl,
    state.status,
    state.position,
    state.duration,
    state.volume,
    state.muted,
    state.queue.length,
    state.currentIndex,
  ]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void currentDesktopWindow()
      .onCloseRequested((event) => {
        if (usePlaybackStore.getState().closeToTray) {
          event.preventDefault();
          void currentDesktopWindow().hide();
        }
      })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!current) {
      notifiedPlaybackSessionRef.current = null;
      return;
    }
    if (
      state.notifications &&
      isPlaybackActive(state.status) &&
      notifiedPlaybackSessionRef.current !== current.playbackSessionId
    ) {
      notifiedPlaybackSessionRef.current = current.playbackSessionId;
      void showTrackNotification(
        current.track.title,
        [current.track.artist, current.track.album].filter(Boolean).join(' · '),
      ).catch(() => undefined);
    }
  }, [current, state.notifications, state.status]);

  useEffect(() => {
    if (!current) return;
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.track.title,
        artist: current.track.artist ?? '',
        album: current.track.album ?? '',
        artwork: current.track.coverArt
          ? [
              {
                src: `${session.proxyBaseUrl}/cover/${encodeURIComponent(current.track.coverArt)}?size=512`,
                sizes: '512x512',
              },
            ]
          : [],
      });
    }
  }, [current, session.proxyBaseUrl]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const audio = () => audioRef.current;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => void audio()?.play()],
      ['pause', () => audio()?.pause()],
      ['previoustrack', () => usePlaybackStore.getState().previous()],
      ['nexttrack', () => usePlaybackStore.getState().next('manual')],
      [
        'seekto',
        (details) => {
          if (audio() && details.seekTime != null) audio()!.currentTime = details.seekTime;
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* Unsupported action. */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* Unsupported action. */
        }
      }
    };
  }, []);

  useEffect(
    () => () => {
      void audioContextRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void persistQueue(), 350);
    return () => window.clearTimeout(timer);
  }, [state.queue, state.currentIndex, state.repeatMode, state.shuffleMode]);

  useEffect(() => {
    const timer = window.setInterval(() => void persistQueue(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void persistQueue(true), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (
        audio &&
        !audio.paused &&
        !audio.seeking &&
        audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      ) {
        reporterRef.current?.sample(performance.now(), audio.duration);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <AudioAnalysisProvider analyser={analyser}>
      {children}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onLoadStart={() => {
          const playback = usePlaybackStore.getState();
          if (playback.status !== 'paused') playback.setStatus('loading');
        }}
        onPlaying={() => {
          const audio = audioRef.current;
          if (audio && !audioContextRef.current && typeof window.AudioContext !== 'undefined') {
            try {
              const context = new AudioContext();
              const source = context.createMediaElementSource(audio);
              const nextAnalyser = context.createAnalyser();
              nextAnalyser.fftSize = 2048;
              nextAnalyser.smoothingTimeConstant = 0.78;
              source.connect(nextAnalyser);
              nextAnalyser.connect(context.destination);
              audioContextRef.current = context;
              audioSourceRef.current = source;
              setAnalyser(nextAnalyser);
            } catch {
              // Playback remains functional if Web Audio is unavailable.
            }
          }
          void audioContextRef.current?.resume();
          reporterRef.current?.playing(performance.now());
          state.setStatus('playing');
        }}
        onPause={() => {
          reporterRef.current?.stopped(performance.now());
          if (!audioRef.current?.ended) state.setStatus('paused');
        }}
        onWaiting={() => {
          reporterRef.current?.stopped(performance.now());
          state.setStatus('stalled');
        }}
        onSeeking={() => reporterRef.current?.stopped(performance.now())}
        onSeeked={() => {
          if (!audioRef.current?.paused) reporterRef.current?.playing(performance.now());
        }}
        onTimeUpdate={(event) =>
          state.setTiming(event.currentTarget.currentTime, event.currentTarget.duration || 0)
        }
        onDurationChange={(event) =>
          state.setTiming(event.currentTarget.currentTime, event.currentTarget.duration || 0)
        }
        onLoadedMetadata={(event) => {
          const position = pendingSeekRef.current;
          if (position > 0 && position < event.currentTarget.duration - 1) {
            event.currentTarget.currentTime = position;
          }
          pendingSeekRef.current = 0;
        }}
        onEnded={() => {
          const audio = audioRef.current;
          reporterRef.current?.stopped(performance.now());
          reporterRef.current?.sample(performance.now(), audio?.duration ?? 0);
          state.next('ended');
        }}
        onError={() => {
          reporterRef.current?.stopped(performance.now());
          if (current) {
            void recordPlaybackEvent({
              eventId: crypto.randomUUID(),
              profileId: session.profile.profileId,
              playbackSessionId: current.playbackSessionId,
              trackId: current.track.id,
              eventType: 'error',
              position: audioRef.current?.currentTime ?? 0,
              listenedMs: Math.round((reporterRef.current?.listened() ?? 0) * 1000),
              sourceContext: 'queue',
            }).catch(() => undefined);
          }
          state.setError(
            'This track could not be streamed. Try another track or test the connection.',
          );
        }}
      />
      <PlayerBar audioRef={audioRef} proxyBaseUrl={session.proxyBaseUrl} />
    </AudioAnalysisProvider>
  );
}

interface PlayerBarProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  proxyBaseUrl: string;
}

function PlayerBar(props: PlayerBarProps) {
  const hasCurrent = usePlaybackStore(
    (state) => state.currentIndex != null && state.queue[state.currentIndex] != null,
  );
  return hasCurrent ? <ActivePlayerBar {...props} /> : null;
}

function ActivePlayerBar({ audioRef, proxyBaseUrl }: PlayerBarProps) {
  const state = usePlaybackStore();
  const [queueOpen, setQueueOpen] = useState(false);
  const queueTriggerRef = useRef<HTMLButtonElement>(null);
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const current = currentQueueItem(state);
  if (!current) return null;
  const track = current.track;
  const playbackActive = isPlaybackActive(state.status);
  const art = track.coverArt
    ? `${proxyBaseUrl}/cover/${encodeURIComponent(track.coverArt)}?size=96`
    : undefined;

  return (
    <footer className="player-bar" data-testid="persistent-player">
      <div className="player-track">
        {art ? (
          <img src={art} alt="" />
        ) : (
          <div className="player-art-fallback" aria-hidden="true">
            ♪
          </div>
        )}
        <div>
          <Link to="/now-playing">
            <strong>{track.title}</strong>
          </Link>
          <span className="player-metadata-links">
            <ArtistLink artistId={track.artistId} name={track.displayArtist ?? track.artist} />
            {' · '}
            <AlbumLink albumId={track.albumId} name={track.album} />
          </span>
        </div>
      </div>
      <div className="player-center">
        <div className="player-controls">
          <button
            type="button"
            className={state.shuffleMode ? 'is-active' : ''}
            aria-label={state.shuffleMode ? 'Disable shuffle' : 'Enable shuffle'}
            aria-pressed={state.shuffleMode}
            onClick={() => state.toggleShuffle()}
          >
            ⇄
          </button>
          <button type="button" aria-label="Previous track" onClick={() => state.previous()}>
            ⏮
          </button>
          <button
            type="button"
            className="play-toggle"
            aria-label={playbackActive ? 'Pause' : 'Play'}
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (playbackActive) pauseAudio(audio, usePlaybackStore.getState());
              else playAudio(audio, usePlaybackStore.getState());
            }}
          >
            {playbackActive ? 'Ⅱ' : '▶'}
          </button>
          <button type="button" aria-label="Next track" onClick={() => state.next('manual')}>
            ⏭
          </button>
          <button
            type="button"
            className={state.repeatMode !== 'off' ? 'is-active' : ''}
            aria-label={`Repeat ${state.repeatMode}`}
            onClick={() => state.cycleRepeat()}
          >
            {state.repeatMode === 'one' ? '↻1' : '↻'}
          </button>
        </div>
        <div className="progress-row">
          <span>{formatClock(state.position)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={Math.max(state.duration, 0)}
            step={0.1}
            value={Math.min(state.position, state.duration || 0)}
            onChange={(event) => {
              if (audioRef.current) audioRef.current.currentTime = Number(event.target.value);
            }}
          />
          <span>{formatClock(state.duration)}</span>
        </div>
        {state.error && (
          <span className="player-error" role="alert">
            {state.error}
          </span>
        )}
      </div>
      <div className="volume-control">
        <button type="button" aria-label="Open mini player" onClick={() => void openMiniPlayer()}>
          Mini
        </button>
        <Link className="visualizer-link" to="/now-playing#visualizer" aria-label="Open visualiser">
          Visualiser
        </Link>
        <div className="queue-popover-anchor">
          <button
            ref={queueTriggerRef}
            className="queue-link"
            type="button"
            aria-label={`${queueOpen ? 'Close' : 'Open'} queue with ${state.queue.length} ${state.queue.length === 1 ? 'item' : 'items'}`}
            aria-expanded={queueOpen}
            aria-controls="player-queue-popover"
            onClick={() => setQueueOpen((open) => !open)}
          >
            Queue{' '}
            {state.currentIndex == null ? '' : `${state.currentIndex + 1}/${state.queue.length}`}
          </button>
          {queueOpen && <QueuePopover open onClose={closeQueue} triggerRef={queueTriggerRef} />}
        </div>
        <button
          type="button"
          aria-label={state.muted ? 'Unmute' : 'Mute'}
          onClick={() => state.setMuted(!state.muted)}
        >
          {state.muted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={state.volume}
          onChange={(event) => state.setVolume(Number(event.target.value))}
        />
      </div>
    </footer>
  );
}

async function persistQueue(syncRemote = false): Promise<void> {
  const state = usePlaybackStore.getState();
  const snapshot = {
    items: state.queue,
    currentIndex: state.currentIndex,
    position: state.position,
    repeatMode: state.repeatMode,
    shuffleMode: state.shuffleMode,
  };
  await saveQueueSnapshot(snapshot).catch(() => undefined);
  if (syncRemote && snapshot.items.length) {
    await syncPlayQueue(snapshot).catch(() => undefined);
  }
}

async function publishPlaybackState(proxyBaseUrl: string): Promise<void> {
  const state = usePlaybackStore.getState();
  const current = currentQueueItem(state);
  await emitPlaybackState({
    track: current?.track ?? null,
    artworkUrl: current?.track.coverArt
      ? `${proxyBaseUrl}/cover/${encodeURIComponent(current.track.coverArt)}?size=192`
      : null,
    status: state.status,
    position: state.position,
    duration: state.duration,
    volume: state.volume,
    muted: state.muted,
    queueLength: state.queue.length,
    currentIndex: state.currentIndex,
  }).catch(() => undefined);
}

function playAudio(
  audio: HTMLAudioElement,
  playback: ReturnType<typeof usePlaybackStore.getState>,
) {
  playback.setError(null);
  void audio.play().catch(() => playback.setStatus('paused'));
}

function pauseAudio(
  audio: HTMLAudioElement | null,
  playback: ReturnType<typeof usePlaybackStore.getState>,
) {
  audio?.pause();
  playback.setStatus('paused');
}

function isPlaybackActive(status: PlaybackStatus): boolean {
  return status === 'loading' || status === 'playing' || status === 'stalled';
}

function formatClock(value: number): string {
  if (!Number.isFinite(value)) return '0:00';
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
