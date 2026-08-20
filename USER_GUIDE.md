# Pocket Player user guide

## Starting Pocket Player

- Double-click **Pocket Player** on the Windows Desktop after the shortcut has been installed.
- The shortcut opens the production application directly; PowerShell and the Vite development server are not required.
- Developers can recreate it after a build with `npm.cmd run shortcut`. The normal MSI or NSIS installer remains the recommended distribution route.

## Connect

1. Start the app with `npm.cmd run tauri dev` during development, or launch an installed build.
2. Enter the canonical Navidrome base URL, username, and password.
3. Leave **Remember login** enabled to store only the password in Windows Credential Manager. The password is never written to settings or SQLite.
4. Private-LAN HTTP requires an explicit warning confirmation. Public HTTP and invalid TLS certificates are rejected.

## Browse and play

- Use Home, Albums, Artists, Tracks, Genres, Tags, or Playlists from the sidebar. The library search stays at the top-right on every page; press Ctrl+K or `/` to focus it.
- Open an album and choose **Play album**, **Shuffle**, or a track’s play action.
- Use **Play next** and **Add to queue** throughout the library.
- Choose **Queue** in the player bar to open its compact panel above the bar without leaving the current page. Jump, reorder with keyboard-accessible arrows, remove, clear, shuffle, or change repeat mode there.
- Open the mini player from the player bar or tray. Its play, pause, previous, next, seek, volume, and mute controls mirror the main player and control the same audio session; it does not start another stream.

## Find and sort tracks quickly

Open **Tracks**. The first visit builds the complete metadata index and later launches load its SQLite cache immediately.

- Search matches titles, artists, albums, genres, multi-value genres, moods, comments, file type, display artist/album artist, and MusicBrainz ID.
- Filter by genre.
- Sort ascending or descending from every displayed metadata heading in track tables. **Length** is numeric, so `9:00` correctly precedes `10:00` rather than being compared as text.
- Technical metadata is split into **Format** (for example, FLAC 44.1 kHz), **Bitrate**, and **Size**. Format sorting also considers sample rate, bit depth, and channel count when Navidrome returns them.
- Choose **Refresh index** after a large server scan or metadata retag.

The index contains metadata only. Audio remains on Navidrome and streams on demand.

## Navigate by tags and credits

- Open **Tags** to browse every indexed multi-value genre and mood, with track and album counts. Filtering matches both tag names and their Genre/Mood category.
- Select a tag to see its exact matches; this is not an approximate text search.
- Artist names and album names are links throughout search results, album cards, track tables, playlists, the queue, Now Playing, statistics, and both player windows.
- A missing Navidrome artist or album ID is displayed as plain text rather than linking to a potentially incorrect match.

## Favourites, ratings, and playlists

- Star songs, albums, or artists and set a 0–5 rating where actions are shown.
- Create and delete playlists from Playlists.
- In a playlist, add tracks, move them up/down, remove them, and save. Server smart playlists may reject edits and remain server-controlled.
- Pin playlists and choose Home section order/visibility in Settings.
- In Settings, choose dark, light, or Windows-following appearance, then optionally layer custom accent, background, and surface colours over it. The preview updates live; **Reset to theme defaults** removes all three overrides.

## Discovery and statistics

- Track Mix offers general, radio, genre, decade, recent, forgotten-favourite, rediscovery, and low-play recipes.
- The familiarity slider shifts the balance without disabling diversity safeguards.
- **Exclude tags** lists indexed moods, including dual Genre/Mood tags, and falls back to indexed genres when the library has no mood metadata.
- Each generated row explains why it was selected; warnings explain unavailable sources.
- Statistics are explicitly based only on playback observed by this desktop application, not every Navidrome client.

## Lyrics and visualisers

- Now Playing displays plain or synchronized lyrics when Navidrome exposes the OpenSubsonic lyrics endpoint.
- Open **Now Playing** and choose **Browse** to explore 22 visualizers grouped into Classic, Particles, 3D & shaders, and Adaptive categories.
- **Sol5.6** turns the live spectrum into tokens, attention paths, memory rails, and a luminous inference core. It is entirely local and does not record or transmit audio.
- Particle scenes include Hyperdrive, Beat sparks, Cosmic dust, Chromatic fountain, Album orbit, Neon rain, and Ribbon trails.
- GPU and pseudo-3D scenes include Neon tunnel, Audio landscape, Pulse geometry, Frequency city, Particle galaxy, Liquid plasma, and Album dimension. Kaleidoscope provides a MilkDrop-inspired radial treatment.
- **AI Conductor** interprets frequency balance, energy, spectral motion, and beats locally, then blends galaxy, tunnel, and plasma treatments. It does not upload audio or contact an AI service.
- Star presets with **★**. Automatic rotation uses favourites when any exist; otherwise it rotates through the complete pack. Random mode changes the order.
- Adjust sensitivity, quality, and rotation interval in the preset browser or Settings.
- **Full screen** expands only the visualizer. Press Escape or its exit button to leave, F to toggle, and Left/Right Arrow to change scenes while full screen.
- Full-screen and visualizer changes affect visuals only; playback continues through the one persistent audio element.
- Visualizers sleep while music is paused, the window is hidden, or Now Playing is off-screen. During sustained heavy scenes they automatically step from 60 to 45 or 30 FPS and reduce internal resolution, then restore quality gradually.
- Low, Balanced, and High cap the internal canvas around 720p, 1440p, and 4K respectively. WebGL scenes request the high-performance GPU; open **Browse** to see the renderer WebView2 selected and the current FPS ceiling.

## Desktop behavior

- Media keys work through Windows/WebView2 Media Session support.
- Optional track-change notifications and close-to-tray are controlled in Settings.
- The tray provides show, mini-player, previous, play/pause, next, and quit actions.
- Starting a second copy focuses the existing application.
- Restarting restores the previous queue and position in a paused state, ready when you choose Play.

## Data and privacy

- Non-secret preferences and the queue are in the Tauri settings store.
- The metadata cache and local playback history are in `library.sqlite3` under the application data directory.
- The password is stored only in the project-specific Windows Credential Manager entry when remembering is enabled.
- **Clear local data** removes the metadata cache and desktop history without changing Navidrome.
- **Export redacted diagnostics** writes a safe JSON report and omits passwords, auth tokens, username, authenticated URLs, and the loopback proxy token.
- Logout removes the remembered credential, active session, and queue.

## If an album says it cannot load

Restart the app so the updated backend and frontend are from the same build. Then use Settings → **Test connection**. If only one album fails, refresh after Navidrome finishes scanning and verify that album opens in another supported client. Diagnostics can be exported from Settings without exposing credentials.
