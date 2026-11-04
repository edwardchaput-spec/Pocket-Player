import { recordPlaybackEvent, reportScrobble } from '../../lib/tauri/playback';
import type { QueueItem } from './queue';
import { ScrobbleController } from './ScrobbleController';

/**
 * Builds the scrobble/history reporter for one playback session. Shared by the
 * HTML audio output (Windows) and the native Media3 output (Android).
 */
export function createTrackReporter(
  current: QueueItem,
  profileId: string,
  position: () => number,
): ScrobbleController {
  return new ScrobbleController(
    (submission) =>
      reportScrobble({
        playbackSessionId: current.playbackSessionId,
        trackId: current.track.id,
        submission,
      }),
    (submission, listenedSeconds) => {
      void recordPlaybackEvent({
        eventId: crypto.randomUUID(),
        profileId,
        playbackSessionId: current.playbackSessionId,
        trackId: current.track.id,
        eventType: submission ? 'completed' : 'now_playing',
        position: position(),
        listenedMs: Math.round(listenedSeconds * 1000),
        sourceContext: 'queue',
      }).catch(() => undefined);
    },
  );
}

/** Records a skip when a session ends after real listening but before completion. */
export function finishTrackReporter(
  reporter: ScrobbleController,
  current: QueueItem,
  profileId: string,
  position: number,
  nowMilliseconds: number,
): void {
  reporter.stopped(nowMilliseconds);
  if (reporter.listened() >= 5 && !reporter.isCompletedOrPending()) {
    void recordPlaybackEvent({
      eventId: crypto.randomUUID(),
      profileId,
      playbackSessionId: current.playbackSessionId,
      trackId: current.track.id,
      eventType: 'skipped',
      position,
      listenedMs: Math.round(reporter.listened() * 1000),
      sourceContext: 'queue',
    }).catch(() => undefined);
  }
}

export function recordTrackError(
  reporter: ScrobbleController | null,
  current: QueueItem,
  profileId: string,
  position: number,
): void {
  void recordPlaybackEvent({
    eventId: crypto.randomUUID(),
    profileId,
    playbackSessionId: current.playbackSessionId,
    trackId: current.track.id,
    eventType: 'error',
    position,
    listenedMs: Math.round((reporter?.listened() ?? 0) * 1000),
    sourceContext: 'queue',
  }).catch(() => undefined);
}
