# Navidrome Desktop user guide

## Connect

1. Start the app with `npm.cmd run tauri dev` during development, or launch an installed build.
2. Enter the canonical Navidrome base URL, username, and password.
3. Leave **Remember login** enabled to store only the password in Windows Credential Manager. The password is never written to settings or SQLite.
4. Private-LAN HTTP requires an explicit warning confirmation. Public HTTP and invalid TLS certificates are rejected.

## Browse and play

- Use Home, Search, Albums, Artists, Tracks, Genres, or Playlists from the sidebar.
- Open an album and choose **Play album**, **Shuffle**, or a track’s play action.
- Use **Play next** and **Add to queue** throughout the library.
- Open Queue to jump, reorder with keyboard-accessible arrows, remove, clear, shuffle, or change repeat mode.
- Open the mini player from the player bar or tray. It controls the same audio session; it does not start another stream.

## Find and sort tracks quickly

Open **Tracks**. The first visit builds the complete metadata index and later launches load its SQLite cache immediately.

- Search matches titles, artists, albums, genres, multi-value genres, moods, comments, file type, display artist/album artist, and MusicBrainz ID.
- Filter by genre.
- Sort ascending or descending by every offered metadata column. **Length** is a numeric duration sort, so `9:00` correctly follows `10:00` rather than being compared as text.
- Technical fields include codec/file type, bitrate, bit depth, sample rate, channel count, and file size when Navidrome returns them.
- Choose **Refresh index** after a large server scan or metadata retag.

The index contains metadata only. Audio remains on Navidrome and streams on demand.

## Favourites, ratings, and playlists

- Star songs, albums, or artists and set a 0–5 rating where actions are shown.
- Create and delete playlists from Playlists.
- In a playlist, add tracks, move them up/down, remove them, and save. Server smart playlists may reject edits and remain server-controlled.
- Pin playlists and choose Home section order/visibility in Settings.

## Discovery and statistics

- Track Mix offers general, radio, genre, decade, recent, forgotten-favourite, rediscovery, and low-play recipes.
- The familiarity slider shifts the balance without disabling diversity safeguards.
- Each generated row explains why it was selected; warnings explain unavailable sources.
- Statistics are explicitly based only on playback observed by this desktop application, not every Navidrome client.

## Lyrics and visualisers

- Now Playing displays plain or synchronized lyrics when Navidrome exposes the OpenSubsonic lyrics endpoint.
- Choose bars, mirrored spectrum, waveform, circular spectrum, or ambient artwork. Quality can be reduced in Settings.
- Full-screen mode affects visuals only; playback continues through the one persistent audio element.

## Desktop behavior

- Media keys work through Windows/WebView2 Media Session support.
- Optional track-change notifications and close-to-tray are controlled in Settings.
- The tray provides show, mini-player, previous, play/pause, next, and quit actions.
- Starting a second copy focuses the existing application.

## Data and privacy

- Non-secret preferences and the queue are in the Tauri settings store.
- The metadata cache and local playback history are in `library.sqlite3` under the application data directory.
- The password is stored only in the project-specific Windows Credential Manager entry when remembering is enabled.
- **Clear local data** removes the metadata cache and desktop history without changing Navidrome.
- **Export redacted diagnostics** writes a safe JSON report and omits passwords, auth tokens, username, authenticated URLs, and the loopback proxy token.
- Logout removes the remembered credential, active session, and queue.

## If an album says it cannot load

Restart the app so the updated backend and frontend are from the same build. Then use Settings → **Test connection**. If only one album fails, refresh after Navidrome finishes scanning and verify that album opens in another supported client. Diagnostics can be exported from Settings without exposing credentials.
