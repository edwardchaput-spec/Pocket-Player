import { AlbumDetail, AlbumSummary, Session, Song } from '../lib/tauri/types';

export const sessionFixture: Session = {
  profile: {
    profileId: 'profile-opaque',
    serverUrl: 'https://music.example.test/navidrome',
    username: 'alice',
    rememberCredential: true,
    lastSuccessfulConnection: '2026-08-17T12:00:00Z',
    server: {
      serverType: 'navidrome',
      serverVersion: '0.58.0',
      openSubsonicCapabilities: ['formPost'],
    },
  },
  proxyBaseUrl: 'http://127.0.0.1:45678/process-token',
  playerSettings: {
    volume: 0.8,
    muted: false,
    visualizer: 'bars',
    visualizerQuality: 2,
    visualizerSensitivity: 1,
    visualizerAutoRotate: false,
    visualizerRotationSeconds: 30,
    visualizerRandomMode: false,
    visualizerFavorites: [],
    theme: 'dark',
    customColors: { accent: null, background: null, surface: null },
    density: 'comfortable',
    notifications: true,
    closeToTray: false,
    homeSections: [
      'newest',
      'trackMix',
      'recent',
      'frequent',
      'starredAlbums',
      'random',
      'favouriteTracks',
      'pinnedPlaylists',
    ],
    pinnedPlaylistIds: [],
    trackTableColumns: {
      standard: ['title', 'artist', 'album', 'duration'],
      detailed: [
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
      ],
    },
  },
};

export const albumsFixture: AlbumSummary[] = [
  {
    id: 'album:one',
    name: 'First Album',
    artist: 'First Artist',
    coverArt: 'cover:one',
    year: 2025,
  },
  { id: 'album:two', name: 'Second Album', artist: 'Second Artist' },
];

export const songsFixture: Song[] = [
  { id: 'song-2', title: 'Second', track: 2, discNumber: 1, duration: 200 },
  { id: 'song-3', title: 'Third', track: 1, discNumber: 2, duration: 180 },
  { id: 'song-1', title: 'First', track: 1, discNumber: 1, duration: 190 },
];

export const albumFixture: AlbumDetail = {
  id: 'album:one',
  name: 'First Album',
  artist: 'First Artist',
  songCount: 3,
  duration: 570,
  songs: songsFixture,
};
