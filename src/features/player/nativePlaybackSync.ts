import type { NativePlaybackEvent, NativeQueueItem } from '../../lib/tauri/nativePlayback';
import { NativeSpectrumAnalyser } from './nativeAnalyser';
import type { QueueItem } from './queue';
import { currentQueueItem, type PlaybackStatus, type PlaybackState } from './playbackStore';
import type { ScrobbleController } from './ScrobbleController';
import { createTrackReporter, finishTrackReporter, recordTrackError } from './trackReporter';

export interface NativePlaybackApi {
  setQueue: (input: {
    items: NativeQueueItem[];
    startIndex: number;
    positionMs: number;
    playWhenReady: boolean;
  }) => Promise<void>;
  skipTo: (index: number, playWhenReady: boolean) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setRepeatMode: (mode: PlaybackState['repeatMode']) => Promise<void>;
  setSpectrumEnabled: (enabled: boolean) => Promise<void>;
}

export interface PlaybackStoreAccess {
  getState(): PlaybackState;
  subscribe(listener: (state: PlaybackState, previous: PlaybackState) => void): () => void;
}

interface SyncOptions {
  api: NativePlaybackApi;
  store: PlaybackStoreAccess;
  proxyBaseUrl: string;
  profileId: string;
  analyser: NativeSpectrumAnalyser;
  now?: () => number;
  reporterFactory?: typeof createTrackReporter;
}

const STREAM_ERROR = 'This track could not be streamed. Try another track or test the connection.';

/**
 * Keeps the native Media3 playlist in step with the webview queue (ADR-011).
 *
 * The store stays the queue authority. Store changes push to native; native
 * track transitions (auto-advance, lock screen, Bluetooth, Android Auto) are
 * mirrored back into the store. Guards make each mirrored change a no-op on
 * the way back so the two sides never ping-pong.
 */
export class NativePlaybackSync {
  private readonly api: NativePlaybackApi;
  private readonly store: PlaybackStoreAccess;
  private readonly now: () => number;
  private readonly reporterFactory: typeof createTrackReporter;
  private pushedSignature: string | null = null;
  private syncedSession: string | null = null;
  private expectNativeSession = false;
  private adoptExternalQueue = false;
  private endedHandled = false;
  private wasPlaying = false;
  private spectrumEnabled = false;
  private reporter: ScrobbleController | null = null;
  private reporterItem: QueueItem | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: SyncOptions) {
    this.api = options.api;
    this.store = options.store;
    this.now = options.now ?? (() => performance.now());
    this.reporterFactory = options.reporterFactory ?? createTrackReporter;
  }

  start(): void {
    const state = this.store.getState();
    this.syncQueue(state, true);
    void this.api.setVolume(nativeVolume(state)).catch(() => undefined);
    void this.api.setRepeatMode(state.repeatMode).catch(() => undefined);
    this.syncReporter(state);
    this.unsubscribe = this.store.subscribe((next, previous) => this.onStore(next, previous));
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.finishReporter();
  }

  /** Transport used by the player bar and desktop-style controls. */
  readonly transport = {
    play: () => {
      this.store.getState().setError(null);
      void this.api.play().catch(() => this.store.getState().setStatus('paused'));
    },
    pause: () => {
      void this.api.pause().catch(() => undefined);
      this.store.getState().setStatus('paused');
    },
    seek: (seconds: number) => {
      const state = this.store.getState();
      void this.api.seekTo(seconds * 1000).catch(() => undefined);
      state.setTiming(seconds, state.duration);
    },
  };

  /** Polls visualiser demand; call about once a second. */
  updateSpectrumDemand(): void {
    const wanted = this.options.analyser.isInDemand() && this.store.getState().status === 'playing';
    if (wanted === this.spectrumEnabled) return;
    this.spectrumEnabled = wanted;
    if (!wanted) this.options.analyser.reset();
    void this.api.setSpectrumEnabled(wanted).catch(() => undefined);
  }

  handleNativeEvent(event: NativePlaybackEvent): void {
    const state = this.store.getState();
    switch (event.type) {
      case 'spectrum':
        this.options.analyser.applyFrame(event.frequency, event.waveform);
        return;
      case 'externalQueue':
        this.adoptExternalQueue = true;
        state.replaceAndPlay(event.songs, event.index);
        return;
      case 'error': {
        const current = currentQueueItem(state);
        this.reporter?.stopped(this.now());
        if (current)
          recordTrackError(this.reporter, current, this.options.profileId, state.position);
        state.setError(STREAM_ERROR);
        return;
      }
      case 'transition':
        this.onTransition(event, state);
        return;
      case 'state':
        this.onNativeState(event, state);
        return;
    }
  }

  private onTransition(
    event: Extract<NativePlaybackEvent, { type: 'transition' }>,
    state: PlaybackState,
  ) {
    if (event.reason === 'playlistChanged') return;
    this.completeSample(state);
    if (event.reason === 'repeat') {
      // Repeat-one loop: renew the session so the replay scrobbles separately.
      this.expectNativeSession = true;
      state.next('ended');
      return;
    }
    if (
      event.index >= 0 &&
      event.index !== state.currentIndex &&
      event.index < state.queue.length
    ) {
      this.expectNativeSession = true;
      state.jumpTo(event.index);
    }
  }

  private onNativeState(
    event: Extract<NativePlaybackEvent, { type: 'state' }>,
    state: PlaybackState,
  ) {
    if (!currentQueueItem(state)) return;
    const duration = event.durationMs > 0 ? event.durationMs / 1000 : state.duration;
    state.setTiming(event.positionMs / 1000, duration);

    if (event.isPlaying && !this.wasPlaying) this.reporter?.playing(this.now());
    if (!event.isPlaying && this.wasPlaying) this.reporter?.stopped(this.now());
    if (event.isPlaying) this.reporter?.sample(this.now(), duration);
    this.wasPlaying = event.isPlaying;

    if (event.playbackState === 'ended') {
      if (!this.endedHandled) {
        this.endedHandled = true;
        this.completeSample(state);
        this.expectNativeSession = true;
        state.next('ended');
      }
      return;
    }
    this.endedHandled = false;
    const status = nativeStatus(event, state.status);
    if (status !== state.status) state.setStatus(status);
  }

  private completeSample(state: PlaybackState) {
    this.reporter?.stopped(this.now());
    this.reporter?.sample(this.now(), state.duration);
  }

  private onStore(state: PlaybackState, previous: PlaybackState) {
    this.syncQueue(state, false);
    if (state.volume !== previous.volume || state.muted !== previous.muted) {
      void this.api.setVolume(nativeVolume(state)).catch(() => undefined);
    }
    if (state.repeatMode !== previous.repeatMode) {
      void this.api.setRepeatMode(state.repeatMode).catch(() => undefined);
    }
    this.syncReporter(state);
  }

  private syncQueue(state: PlaybackState, initial: boolean) {
    const signature = queueSignature(state.queue);
    const current = currentQueueItem(state);
    if (signature !== this.pushedSignature) {
      this.pushedSignature = signature;
      this.syncedSession = current?.playbackSessionId ?? null;
      this.expectNativeSession = false;
      if (this.adoptExternalQueue) {
        // Native already holds this list (e.g. chosen in Android Auto).
        this.adoptExternalQueue = false;
        return;
      }
      if (state.queue.length === 0) {
        if (!initial) void this.api.stop().catch(() => undefined);
        return;
      }
      void this.api
        .setQueue({
          items: state.queue.map((item) => this.toNativeItem(item)),
          startIndex: state.currentIndex ?? 0,
          positionMs: Math.round(state.position * 1000),
          playWhenReady: !initial && isActive(state.status),
        })
        .catch(() => state.setError(STREAM_ERROR));
      return;
    }
    const session = current?.playbackSessionId ?? null;
    if (session === this.syncedSession) return;
    this.syncedSession = session;
    if (this.expectNativeSession) {
      this.expectNativeSession = false;
      return;
    }
    if (current && state.currentIndex != null) {
      void this.api.skipTo(state.currentIndex, true).catch(() => undefined);
    }
  }

  private syncReporter(state: PlaybackState) {
    const current = currentQueueItem(state) ?? null;
    if (current?.playbackSessionId === this.reporterItem?.playbackSessionId) return;
    this.finishReporter();
    this.reporterItem = current;
    this.wasPlaying = false;
    this.reporter = current
      ? this.reporterFactory(current, this.options.profileId, () => this.store.getState().position)
      : null;
  }

  private finishReporter() {
    if (this.reporter && this.reporterItem) {
      finishTrackReporter(
        this.reporter,
        this.reporterItem,
        this.options.profileId,
        this.store.getState().position,
        this.now(),
      );
    }
    this.reporter = null;
    this.reporterItem = null;
  }

  private toNativeItem(item: QueueItem): NativeQueueItem {
    const base = this.options.proxyBaseUrl;
    const track = item.track;
    return {
      mediaId: item.occurrenceId,
      songId: track.id,
      url: `${base}/stream/${encodeURIComponent(track.id)}`,
      title: track.title,
      artist: track.displayArtist ?? track.artist ?? null,
      album: track.album ?? null,
      artworkUrl: track.coverArt
        ? `${base}/cover/${encodeURIComponent(track.coverArt)}?size=512`
        : null,
    };
  }
}

/**
 * Phones control loudness with the hardware volume keys and the compact layout
 * hides the app volume slider, so native output plays at full app volume and
 * only honours mute. Otherwise a stored desktop volume would silently cap it.
 */
export function nativeVolume(state: Pick<PlaybackState, 'muted'>): number {
  return state.muted ? 0 : 1;
}

export function queueSignature(queue: readonly QueueItem[]): string {
  return queue.map((item) => item.occurrenceId).join('\u0000');
}

function isActive(status: PlaybackStatus): boolean {
  return status === 'loading' || status === 'playing' || status === 'stalled';
}

function nativeStatus(
  event: Extract<NativePlaybackEvent, { type: 'state' }>,
  previous: PlaybackStatus,
): PlaybackStatus {
  if (event.isPlaying) return 'playing';
  if (!event.playWhenReady) return 'paused';
  if (event.playbackState === 'buffering') return previous === 'playing' ? 'stalled' : 'loading';
  return previous;
}
