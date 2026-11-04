import { beforeEach, describe, expect, it, vi } from 'vitest';

import { songsFixture } from '../../test/fixtures';
import { NativeSpectrumAnalyser } from './nativeAnalyser';
import { NativePlaybackSync, type NativePlaybackApi } from './nativePlaybackSync';
import { currentQueueItem, usePlaybackStore } from './playbackStore';

vi.mock('../../lib/tauri/playback', () => ({
  recordPlaybackEvent: vi.fn(() => Promise.resolve()),
  reportScrobble: vi.fn(() => Promise.resolve(true)),
}));

const BASE = 'http://127.0.0.1:45678/process-token';

function fakeApi() {
  const ok = <K extends keyof NativePlaybackApi>() =>
    vi.fn<NativePlaybackApi[K]>(() => Promise.resolve());
  return {
    setQueue: ok<'setQueue'>(),
    skipTo: ok<'skipTo'>(),
    play: ok<'play'>(),
    pause: ok<'pause'>(),
    stop: ok<'stop'>(),
    seekTo: ok<'seekTo'>(),
    setVolume: ok<'setVolume'>(),
    setRepeatMode: ok<'setRepeatMode'>(),
    setSpectrumEnabled: ok<'setSpectrumEnabled'>(),
  };
}

function startSync(api = fakeApi(), analyser = new NativeSpectrumAnalyser()) {
  const sync = new NativePlaybackSync({
    api,
    store: usePlaybackStore,
    proxyBaseUrl: BASE,
    profileId: 'profile-opaque',
    analyser,
  });
  sync.start();
  return { sync, api, analyser };
}

const state = (overrides: Partial<Record<string, unknown>> = {}) => ({
  type: 'state' as const,
  index: 0,
  itemCount: 3,
  mediaId: null,
  songId: null,
  isPlaying: true,
  playWhenReady: true,
  playbackState: 'ready' as const,
  positionMs: 0,
  durationMs: 200_000,
  ...overrides,
});

beforeEach(() => {
  usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
});

describe('NativePlaybackSync', () => {
  it('pushes a new queue through the loopback proxy and starts playback', () => {
    const { api } = startSync();
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 1);

    expect(api.setQueue).toHaveBeenCalledTimes(1);
    const input = api.setQueue.mock.calls[0]![0];
    expect(input.startIndex).toBe(1);
    expect(input.playWhenReady).toBe(true);
    expect(input.items[0]).toMatchObject({
      songId: songsFixture[0]!.id,
      url: `${BASE}/stream/${songsFixture[0]!.id}`,
      mediaId: usePlaybackStore.getState().queue[0]!.occurrenceId,
    });
    expect(api.skipTo).not.toHaveBeenCalled();
  });

  it('restores a saved queue without auto-playing', () => {
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    usePlaybackStore.getState().setStatus('paused');
    const { api } = startSync();
    expect(api.setQueue.mock.calls[0]![0].playWhenReady).toBe(false);
  });

  it('skips natively when the user changes track, without re-pushing the queue', () => {
    const { api } = startSync();
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    usePlaybackStore.getState().next('manual');

    expect(api.setQueue).toHaveBeenCalledTimes(1);
    expect(api.skipTo).toHaveBeenCalledWith(1, true);
  });

  it('mirrors native auto-advance into the store without echoing a skip', () => {
    const { sync, api } = startSync();
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);

    sync.handleNativeEvent({ type: 'transition', index: 1, reason: 'auto' });

    expect(usePlaybackStore.getState().currentIndex).toBe(1);
    expect(api.skipTo).not.toHaveBeenCalled();
    expect(api.setQueue).toHaveBeenCalledTimes(1);
  });

  it('renews the session on a native repeat-one loop without skipping', () => {
    const { sync, api } = startSync();
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    usePlaybackStore.setState({ repeatMode: 'one' });
    const before = currentQueueItem(usePlaybackStore.getState())!.playbackSessionId;

    sync.handleNativeEvent({ type: 'transition', index: 0, reason: 'repeat' });

    const after = currentQueueItem(usePlaybackStore.getState())!.playbackSessionId;
    expect(after).not.toBe(before);
    expect(api.skipTo).not.toHaveBeenCalled();
    expect(api.setRepeatMode).toHaveBeenLastCalledWith('one');
  });

  it('adopts a queue chosen in Android Auto without pushing it back', () => {
    const { sync, api } = startSync();
    sync.handleNativeEvent({ type: 'externalQueue', songs: songsFixture, index: 2 });

    const store = usePlaybackStore.getState();
    expect(store.currentIndex).toBe(2);
    expect(store.queue.map((item) => item.track.id)).toEqual(songsFixture.map((song) => song.id));
    expect(api.setQueue).not.toHaveBeenCalled();
    expect(api.skipTo).not.toHaveBeenCalled();
  });

  it('applies native timing and status, and ends the queue when native ends', () => {
    const { sync } = startSync();
    usePlaybackStore.getState().replaceAndPlay(songsFixture.slice(0, 1), 0);

    sync.handleNativeEvent(state({ positionMs: 12_500 }));
    expect(usePlaybackStore.getState()).toMatchObject({
      status: 'playing',
      position: 12.5,
      duration: 200,
    });

    sync.handleNativeEvent(state({ isPlaying: false, playWhenReady: false }));
    expect(usePlaybackStore.getState().status).toBe('paused');

    sync.handleNativeEvent(state({ isPlaying: false, playbackState: 'ended' }));
    expect(usePlaybackStore.getState().currentIndex).toBeNull();
  });

  it('plays at full app volume, honours mute, and forwards repeat changes', () => {
    usePlaybackStore.getState().setVolume(0.3);
    const { api } = startSync();
    expect(api.setVolume).toHaveBeenLastCalledWith(1);
    usePlaybackStore.getState().setVolume(0.4);
    expect(api.setVolume).toHaveBeenLastCalledWith(1);
    usePlaybackStore.getState().setMuted(true);
    usePlaybackStore.getState().cycleRepeat();
    expect(api.setVolume).toHaveBeenLastCalledWith(0);
    expect(api.setRepeatMode).toHaveBeenLastCalledWith(usePlaybackStore.getState().repeatMode);
  });

  it('streams spectrum frames only while a visualiser reads them during playback', () => {
    let clock = 0;
    const analyser = new NativeSpectrumAnalyser(() => clock);
    const { sync, api } = startSync(fakeApi(), analyser);
    usePlaybackStore.getState().replaceAndPlay(songsFixture, 0);
    usePlaybackStore.getState().setStatus('playing');

    sync.updateSpectrumDemand();
    expect(api.setSpectrumEnabled).not.toHaveBeenCalled();

    analyser.getByteFrequencyData(new Uint8Array(analyser.frequencyBinCount));
    sync.updateSpectrumDemand();
    expect(api.setSpectrumEnabled).toHaveBeenLastCalledWith(true);

    clock += 5000;
    sync.updateSpectrumDemand();
    expect(api.setSpectrumEnabled).toHaveBeenLastCalledWith(false);
  });
});

describe('NativeSpectrumAnalyser', () => {
  it('decodes frames with Web Audio byte semantics and ignores bad sizes', () => {
    const analyser = new NativeSpectrumAnalyser();
    const frequency = new Uint8Array(analyser.frequencyBinCount).fill(200);
    const waveform = new Uint8Array(analyser.fftSize).fill(64);
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    analyser.applyFrame(encode(frequency), encode(waveform));

    const readFrequency = new Uint8Array(analyser.frequencyBinCount);
    const readWaveform = new Uint8Array(analyser.fftSize);
    analyser.getByteFrequencyData(readFrequency);
    analyser.getByteTimeDomainData(readWaveform);
    expect(readFrequency[10]).toBe(200);
    expect(readWaveform[10]).toBe(64);

    analyser.applyFrame(encode(new Uint8Array(3)), 'not base64!');
    analyser.getByteFrequencyData(readFrequency);
    expect(readFrequency[10]).toBe(200);
  });
});
