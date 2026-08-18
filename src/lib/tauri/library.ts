import { z } from 'zod';

import { invokeParsed, invokeVoid } from './invoke';
import {
  albumDetailSchema,
  albumSummarySchema,
  artistDetailSchema,
  artistSummarySchema,
  genreSchema,
  libraryIndexStatusSchema,
  lyricsListSchema,
  MixInput,
  mixResultSchema,
  playlistDetailSchema,
  playlistSummarySchema,
  searchResultsSchema,
  songSchema,
  tagSummarySchema,
  TrackQuery,
  trackQueryResultSchema,
} from './types';

export const getNewestAlbums = (size: number, offset: number) =>
  invokeParsed('newest_albums', z.array(albumSummarySchema), { size, offset });

export const getAlbum = (albumId: string) =>
  invokeParsed('get_album', albumDetailSchema, { albumId });

export type AlbumListType =
  | 'newest'
  | 'recent'
  | 'frequent'
  | 'starred'
  | 'random'
  | 'highest'
  | 'alphabeticalByName'
  | 'alphabeticalByArtist';

export const getAlbumList = (listType: AlbumListType, size: number, offset: number) =>
  invokeParsed('album_list', z.array(albumSummarySchema), { listType, size, offset });

export const searchLibrary = (query: string) =>
  invokeParsed('search_library', searchResultsSchema, { query });

export const getArtists = () => invokeParsed('artists', z.array(artistSummarySchema));

export const getArtist = (artistId: string) =>
  invokeParsed('get_artist', artistDetailSchema, { artistId });

export const getGenres = () => invokeParsed('genres', z.array(genreSchema));

export const getSongsByGenre = (genre: string, count: number, offset: number) =>
  invokeParsed('songs_by_genre', z.array(songSchema), { genre, count, offset });

export const getStarred = () => invokeParsed('starred', searchResultsSchema);

export const getLyrics = (songId: string) => invokeParsed('lyrics', lyricsListSchema, { songId });

export const getPlaylists = () => invokeParsed('playlists', z.array(playlistSummarySchema));

export const getPlaylist = (playlistId: string) =>
  invokeParsed('get_playlist', playlistDetailSchema, { playlistId });

export const getLibraryIndexStatus = () =>
  invokeParsed('library_index_status', libraryIndexStatusSchema);

export const refreshLibraryIndex = () =>
  invokeParsed('refresh_library_index', libraryIndexStatusSchema);

export const queryTracks = (input: TrackQuery) =>
  invokeParsed('query_tracks', trackQueryResultSchema, { input });

export const getTags = () => invokeParsed('tags', z.array(tagSummarySchema));

export const setStarred = (
  itemId: string,
  itemType: 'song' | 'album' | 'artist',
  starred: boolean,
) => invokeVoid('set_starred', { itemId, itemType, starred });

export const setRating = (itemId: string, rating: number) =>
  invokeVoid('set_rating', { itemId, rating });

export const createPlaylist = (name: string, songIds: string[] = []) =>
  invokeParsed('create_playlist', playlistDetailSchema, { name, songIds });

export const replacePlaylist = (playlistId: string, name: string | null, songIds: string[]) =>
  invokeParsed('replace_playlist', playlistDetailSchema, { playlistId, name, songIds });

export const deletePlaylist = (playlistId: string) => invokeVoid('delete_playlist', { playlistId });

export const generateMix = (input: MixInput) =>
  invokeParsed('generate_mix', mixResultSchema, { input });
