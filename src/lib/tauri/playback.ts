import { z } from 'zod';

import { invokeParsed, invokeVoid } from './invoke';
import {
  listeningStatisticsSchema,
  diagnosticsExportSchema,
  PlaybackEventInput,
  PlayerSettings,
  QueueSnapshot,
} from './types';

export interface ScrobbleInput {
  playbackSessionId: string;
  trackId: string;
  submission: boolean;
}

export const reportScrobble = (input: ScrobbleInput) =>
  invokeParsed('report_scrobble', z.boolean(), { input });

export const savePlayerSettings = (settings: PlayerSettings) =>
  invokeVoid('save_player_settings', { settings });

export const saveQueueSnapshot = (snapshot: QueueSnapshot) =>
  invokeVoid('save_queue_snapshot', { snapshot });

export const syncPlayQueue = (snapshot: QueueSnapshot) =>
  invokeVoid('sync_play_queue', { snapshot });

export const recordPlaybackEvent = (input: PlaybackEventInput) =>
  invokeVoid('record_playback_event', { input });

export const getListeningStatistics = () =>
  invokeParsed('listening_statistics', listeningStatisticsSchema);

export const clearLocalLibraryData = () => invokeVoid('clear_local_library_data');

export const exportDiagnostics = () => invokeParsed('export_diagnostics', diagnosticsExportSchema);
