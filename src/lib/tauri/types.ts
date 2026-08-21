import { z } from 'zod';

import { VISUALIZER_MODES } from '../../features/visualizer/visualizerPresets';

const appErrorDataSchema = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.string().optional(),
  retryable: z.boolean(),
});
export class AppError extends Error {
  readonly code: string;
  readonly detail: string | undefined;
  readonly retryable: boolean;

  constructor(data: z.infer<typeof appErrorDataSchema>) {
    super(data.message);
    this.name = 'AppError';
    this.code = data.code;
    this.detail = data.detail;
    this.retryable = data.retryable;
  }
}

export const appErrorSchema = appErrorDataSchema.transform((data) => new AppError(data));

export const serverInfoSchema = z.object({
  serverType: z.string().nullable().optional(),
  serverVersion: z.string().nullable().optional(),
  openSubsonicCapabilities: z.array(z.string()),
});

export const profileSchema = z.object({
  profileId: z.string(),
  serverUrl: z.string(),
  username: z.string(),
  rememberCredential: z.boolean(),
  lastSuccessfulConnection: z.string(),
  server: serverInfoSchema,
});
export type Profile = z.infer<typeof profileSchema>;

const customThemeColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const customThemeColorsSchema = z.object({
  accent: customThemeColorSchema.nullable(),
  background: customThemeColorSchema.nullable(),
  surface: customThemeColorSchema.nullable(),
});
export type CustomThemeColors = z.infer<typeof customThemeColorsSchema>;

export const TRACK_TABLE_COLUMN_IDS = [
  'title',
  'artist',
  'album',
  'displayAlbumArtist',
  'track',
  'discNumber',
  'year',
  'genres',
  'moods',
  'tags',
  'duration',
  'playCount',
  'rating',
  'averageRating',
  'starred',
  'bpm',
  'format',
  'suffix',
  'contentType',
  'bitRate',
  'bitDepth',
  'samplingRate',
  'channelCount',
  'size',
  'created',
  'comment',
  'sortName',
  'musicBrainzId',
] as const;
export type TrackTableColumnId = (typeof TRACK_TABLE_COLUMN_IDS)[number];

export const DEFAULT_STANDARD_TRACK_COLUMNS: TrackTableColumnId[] = [
  'title',
  'artist',
  'album',
  'duration',
];
export const DEFAULT_DETAILED_TRACK_COLUMNS: TrackTableColumnId[] = [
  'title',
  'artist',
  'album',
  'tags',
  'duration',
  'playCount',
  'rating',
  'format',
  'bitRate',
  'size',
];

const trackTableColumnListSchema = z
  .array(z.enum(TRACK_TABLE_COLUMN_IDS))
  .min(1)
  .max(TRACK_TABLE_COLUMN_IDS.length)
  .refine((columns) => columns.includes('title'), 'The title column is required.')
  .refine((columns) => new Set(columns).size === columns.length, 'Columns must be unique.');

export const trackTableColumnsSchema = z.object({
  standard: trackTableColumnListSchema,
  detailed: trackTableColumnListSchema,
});
export type TrackTableColumns = z.infer<typeof trackTableColumnsSchema>;

export const playerSettingsSchema = z.object({
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  visualizer: z.enum(VISUALIZER_MODES),
  visualizerQuality: z.number().int().min(1).max(3),
  visualizerSensitivity: z.number().min(0.35).max(2.5),
  visualizerAutoRotate: z.boolean(),
  visualizerRotationSeconds: z.number().int().min(10).max(300),
  visualizerRandomMode: z.boolean(),
  visualizerFavorites: z.array(z.enum(VISUALIZER_MODES)).max(VISUALIZER_MODES.length),
  theme: z.enum(['dark', 'light', 'system']),
  customColors: customThemeColorsSchema,
  density: z.enum(['comfortable', 'compact']),
  notifications: z.boolean(),
  closeToTray: z.boolean(),
  homeSections: z
    .array(
      z.enum([
        'newest',
        'trackMix',
        'recent',
        'frequent',
        'starredAlbums',
        'random',
        'favouriteTracks',
        'pinnedPlaylists',
      ]),
    )
    .max(8),
  pinnedPlaylistIds: z.array(z.string()).max(100),
  trackTableColumns: trackTableColumnsSchema,
});
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;
export type HomeSection = PlayerSettings['homeSections'][number];

export const albumSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  artist: z.string().nullable().optional(),
  artistId: z.string().nullable().optional(),
  coverArt: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  genre: z.string().nullable().optional(),
  duration: z.number().nonnegative().nullable().optional(),
  songCount: z.number().int().nonnegative().nullable().optional(),
  playCount: z.number().int().nonnegative().nullable().optional(),
  userRating: z.number().int().min(0).max(5).nullable().optional(),
  starred: z.string().nullable().optional(),
});
export type AlbumSummary = z.infer<typeof albumSummarySchema>;

export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  album: z.string().nullable().optional(),
  albumId: z.string().nullable().optional(),
  artist: z.string().nullable().optional(),
  artistId: z.string().nullable().optional(),
  coverArt: z.string().nullable().optional(),
  duration: z.number().nonnegative().nullable().optional(),
  track: z.number().int().nullable().optional(),
  discNumber: z.number().int().nullable().optional(),
  contentType: z.string().nullable().optional(),
  suffix: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  genre: z.string().nullable().optional(),
  genres: z.array(z.object({ name: z.string() })).optional(),
  bitRate: z.number().int().nonnegative().nullable().optional(),
  bitDepth: z.number().int().nonnegative().nullable().optional(),
  samplingRate: z.number().int().nonnegative().nullable().optional(),
  channelCount: z.number().int().nonnegative().nullable().optional(),
  size: z.number().int().nonnegative().nullable().optional(),
  playCount: z.number().int().nonnegative().nullable().optional(),
  userRating: z.number().int().min(0).max(5).nullable().optional(),
  averageRating: z.number().min(0).max(5).nullable().optional(),
  starred: z.string().nullable().optional(),
  created: z.string().nullable().optional(),
  bpm: z.number().int().nonnegative().nullable().optional(),
  comment: z.string().nullable().optional(),
  sortName: z.string().nullable().optional(),
  musicBrainzId: z.string().nullable().optional(),
  displayArtist: z.string().nullable().optional(),
  displayAlbumArtist: z.string().nullable().optional(),
  moods: z.array(z.string()).optional(),
});
export type Song = z.infer<typeof songSchema>;

export const albumDetailSchema = albumSummarySchema.extend({
  songs: z.array(songSchema),
});
export type AlbumDetail = z.infer<typeof albumDetailSchema>;

export const artistSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  albumCount: z.number().int().nonnegative().nullable().optional(),
  coverArt: z.string().nullable().optional(),
  artistImageUrl: z.string().nullable().optional(),
  starred: z.string().nullable().optional(),
  userRating: z.number().int().min(0).max(5).nullable().optional(),
});
export type ArtistSummary = z.infer<typeof artistSummarySchema>;

export const artistDetailSchema = artistSummarySchema.extend({
  albums: z.array(albumSummarySchema),
});
export type ArtistDetail = z.infer<typeof artistDetailSchema>;

export const genreSchema = z.object({
  value: z.string(),
  songCount: z.number().int().nonnegative().nullable().optional(),
  albumCount: z.number().int().nonnegative().nullable().optional(),
});
export type Genre = z.infer<typeof genreSchema>;

export const tagSummarySchema = z.object({
  name: z.string(),
  songCount: z.number().int().nonnegative(),
  albumCount: z.number().int().nonnegative(),
  categories: z.array(z.enum(['Genre', 'Mood'])),
});
export type TagSummary = z.infer<typeof tagSummarySchema>;

export const playlistSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  comment: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  public: z.boolean().nullable().optional(),
  songCount: z.number().int().nonnegative().nullable().optional(),
  duration: z.number().nonnegative().nullable().optional(),
  created: z.string().nullable().optional(),
  changed: z.string().nullable().optional(),
  coverArt: z.string().nullable().optional(),
});
export type PlaylistSummary = z.infer<typeof playlistSummarySchema>;

export const playlistDetailSchema = playlistSummarySchema.extend({ songs: z.array(songSchema) });
export type PlaylistDetail = z.infer<typeof playlistDetailSchema>;

export const searchResultsSchema = z.object({
  artists: z.array(artistSummarySchema),
  albums: z.array(albumSummarySchema),
  songs: z.array(songSchema),
});
export type SearchResults = z.infer<typeof searchResultsSchema>;

export const libraryIndexStatusSchema = z.object({
  ready: z.boolean(),
  trackCount: z.number().int().nonnegative(),
  refreshedAt: z.string().nullable().optional(),
});
export type LibraryIndexStatus = z.infer<typeof libraryIndexStatusSchema>;

export const trackQueryResultSchema = z.object({
  tracks: z.array(songSchema),
  total: z.number().int().nonnegative(),
  refreshedAt: z.string(),
});
export type TrackQueryResult = z.infer<typeof trackQueryResultSchema>;

export interface TrackQuery {
  query: string;
  genre?: string | undefined;
  tag?: string | undefined;
  sortBy: TrackSortField;
  descending: boolean;
  offset: number;
  size: number;
}

export type TrackSortField =
  | 'title'
  | 'artist'
  | 'album'
  | 'year'
  | 'genre'
  | 'duration'
  | 'track'
  | 'discNumber'
  | 'playCount'
  | 'rating'
  | 'starred'
  | 'format'
  | 'bitRate'
  | 'bitDepth'
  | 'samplingRate'
  | 'channelCount'
  | 'size'
  | 'suffix'
  | 'created'
  | 'bpm';

export const queueItemSchema = z.object({
  occurrenceId: z.string(),
  playbackSessionId: z.string(),
  track: songSchema,
});

export const queueSnapshotSchema = z.object({
  items: z.array(queueItemSchema).max(10_000),
  unshuffledOccurrenceIds: z.array(z.string().min(1).max(100)).max(10_000).nullable().default(null),
  currentIndex: z.number().int().nonnegative().nullable(),
  position: z.number().nonnegative(),
  repeatMode: z.enum(['off', 'queue', 'one']),
  shuffleMode: z.boolean(),
});
export type QueueSnapshot = z.infer<typeof queueSnapshotSchema>;

export const listeningStatisticsSchema = z.object({
  totalListenedMs: z.number().nonnegative(),
  completedPlays: z.number().int().nonnegative(),
  uniqueTracks: z.number().int().nonnegative(),
  topTracks: z.array(
    z.object({
      trackId: z.string(),
      title: z.string(),
      artist: z.string().nullable().optional(),
      artistId: z.string().nullable().optional(),
      album: z.string().nullable().optional(),
      albumId: z.string().nullable().optional(),
      plays: z.number().int().nonnegative(),
      listenedMs: z.number().nonnegative(),
    }),
  ),
  daily: z.array(
    z.object({
      date: z.string(),
      listenedMs: z.number().nonnegative(),
      plays: z.number().int().nonnegative(),
    }),
  ),
});
export type ListeningStatistics = z.infer<typeof listeningStatisticsSchema>;

export const mixResultSchema = z.object({
  seed: z.string(),
  items: z.array(
    z.object({
      track: songSchema,
      reason: z.string(),
      score: z.number(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type MixResult = z.infer<typeof mixResultSchema>;

export const lyricsListSchema = z.object({
  lyrics: z.array(
    z.object({
      displayArtist: z.string().nullable().optional(),
      displayTitle: z.string().nullable().optional(),
      lang: z.string().nullable().optional(),
      offset: z.number().int().nullable().optional(),
      synced: z.boolean(),
      lines: z.array(
        z.object({ start: z.number().nonnegative().nullable().optional(), value: z.string() }),
      ),
    }),
  ),
});
export type LyricsList = z.infer<typeof lyricsListSchema>;

export type MixRecipe =
  | 'trackMix'
  | 'artistRadio'
  | 'songRadio'
  | 'genreMix'
  | 'decadeMix'
  | 'recentlyAdded'
  | 'forgottenFavourites'
  | 'rediscoverYear'
  | 'lowPlayDiscovery';

export interface MixInput {
  recipe: MixRecipe;
  seedTrackId?: string | undefined;
  seedArtistId?: string | undefined;
  genre?: string | undefined;
  year?: number | undefined;
  length: number;
  adventure: number;
  excludedGenres?: string[] | undefined;
  excludedTags?: string[] | undefined;
  randomSeed?: string | undefined;
}

export interface PlaybackEventInput {
  eventId: string;
  profileId: string;
  playbackSessionId: string;
  trackId: string;
  eventType: 'now_playing' | 'completed' | 'skipped' | 'error';
  position: number;
  listenedMs: number;
  sourceContext?: string;
}

export const diagnosticsExportSchema = z.object({ path: z.string() });

export const sessionSchema = z.object({
  profile: profileSchema,
  proxyBaseUrl: z.string().url(),
  playerSettings: playerSettingsSchema,
  queueSnapshot: queueSnapshotSchema.nullable().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

export const startupSchema = z.object({
  session: sessionSchema.nullable().optional(),
  savedProfile: profileSchema.nullable().optional(),
  restorationError: appErrorSchema.nullable().optional(),
});
export type Startup = z.infer<typeof startupSchema>;

export interface LoginInput {
  serverUrl: string;
  username: string;
  password: string;
  rememberCredential: boolean;
  allowPrivateHttp: boolean;
}
