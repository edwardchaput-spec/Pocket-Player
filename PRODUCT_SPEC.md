# Pocket Player - Product Specification

## Document status

- Product name: **Pocket Player**
- Tagline: **A Navidrome Revolution**
- Product type: Windows-first desktop music client
- Primary server: the user's existing Navidrome instance
- Development location: a normal local folder on the Windows desktop, opened directly in Cursor
- Deployment model: installed and run on the desktop; no application service is deployed to Proxmox or the home server
- API target: Navidrome's supported Subsonic/OpenSubsonic-compatible REST API
- Initial release scope: one Windows user, one configured Navidrome profile, online streaming

Pocket Player and “A Navidrome Revolution” are the product’s public name and tagline. The existing package identifier remains stable so upgrades retain local settings and Windows credentials.

## 1. Product summary

Pocket Player is a native-feeling Windows music application that connects to an existing Navidrome server and presents the user's personal music library without occupying a browser window.

It should combine:

- A polished library interface for albums, artists, tracks, playlists, and search.
- A persistent compact player and an optional always-on-top mini player.
- Home-page discovery sections inspired by Symfonium, including recently added, recently played, frequently played, favourites, track mixes, and forgotten music.
- Reliable queue and playback state.
- Windows media-key, taskbar, notification, and system-tray integration.
- Real-time audio visualisations.
- A transparent and adjustable mix engine that can balance familiar music with discovery.

Navidrome remains the source of truth for users, media metadata, favourites, ratings, playlists, play counts, and server-side permissions. The desktop application may maintain a local cache and local playback-event history to improve responsiveness and power client-only recommendations, but it must not become a second media server.

## 2. Problem statement

The Navidrome web interface is useful, but it remains tied to a browser tab or browser window and does not provide the full desktop experience wanted for everyday listening. Existing clients demonstrate parts of the desired experience, but the goal is a personally tailored application with a coherent mini player, rich home screen, custom mix logic, and visualisation system.

The product should make starting and controlling music feel as convenient as a dedicated desktop service while continuing to use the existing Navidrome library and account.

## 3. Product goals

### 3.1 Primary goals

1. Provide a dependable Windows desktop front end for Navidrome.
2. Remove the need to keep a browser window open for normal listening.
3. Make the current track and essential controls available in a compact mini player.
4. Surface useful personal sections such as most played, recently added, recently played, favourites, and track mix.
5. Preserve Navidrome account permissions and user-specific data.
6. Make playback, queue changes, favourites, ratings, playlists, and scrobbles behave predictably.
7. Support real-time audio visualisations without compromising playback stability.
8. Keep setup simple: server URL, Navidrome username, and Navidrome password.

### 3.2 Secondary goals

1. Allow multiple Navidrome server profiles in a later release.
2. Support optional advanced playback through MPV after the first stable HTML audio implementation.
3. Provide detailed local listening statistics and time-based summaries.
4. Support an extensible internal visualiser architecture.
5. Provide configurable mix recipes and home-screen sections.

## 4. Non-goals

The initial product is not intended to:

- Replace, fork, or modify the Navidrome server.
- Run as a Docker container or service on Proxmox.
- Scrape or embed the Navidrome web interface.
- Use Navidrome's undocumented private web API where a supported Subsonic/OpenSubsonic endpoint exists.
- Edit tags in the underlying music files.
- Upload, move, rename, or delete media files.
- Provide a mobile application.
- Provide a public multi-tenant SaaS product.
- Implement offline downloads in the first release.
- Execute untrusted third-party visualiser code in the first release.
- Require a separate cloud account or analytics service.

## 5. Target environment

### 5.1 Development

- Windows desktop.
- Cursor opens the project as a local folder, not through Remote SSH.
- Git repository stored locally on the desktop or in the user's normal source-code location.
- Node.js active LTS, npm, Rust stable, and the current supported Tauri prerequisites installed locally.
- The actual Navidrome server is treated as an external test dependency and is never modified by the project bootstrap.

### 5.2 Runtime

- Windows 10 or Windows 11, with Windows 11 as the primary visual target.
- An existing reachable Navidrome server.
- HTTPS is expected for normal use, especially away from the home LAN.
- The user signs in with a normal Navidrome account.
- The application uses that account's library visibility and permissions.

## 6. Primary user journey

1. The user installs or starts Pocket Player.
2. On first launch, the app presents a connection screen.
3. The user enters:
   - Navidrome server URL.
   - Navidrome username.
   - Navidrome password.
   - Whether the login should be remembered.
4. The app validates the connection with the supported API.
5. On success, the password is stored in Windows Credential Manager when "Remember me" is enabled. It is never stored in localStorage, a JSON settings file, logs, source code, or SQLite.
6. The app loads the home screen with real library data.
7. The user opens an album and starts a track.
8. A persistent bottom player displays the current track and controls.
9. The user may later open the compact mini player or hide the main window to the tray while playback continues.
10. Playback is reported to Navidrome so play counts, recent activity, and scrobbling remain accurate.

## 7. Navigation and information architecture

The main application shell should expose the following destinations:

- **Home**
- **Search**
- **Albums**
- **Artists**
- **Tracks**
- **Genres**
- **Tags**
- **Playlists**
- **Now Playing / Queue**
- **Statistics** (later phase)
- **Settings**

The persistent player remains visible at the bottom of the main window whenever a track is loaded. The navigation layout should adapt cleanly between a wide desktop window and a narrow compact window.

## 8. Functional requirements

### 8.1 Connection and authentication

The application must:

- Accept a server URL with or without a trailing slash and normalise it safely.
- Support a Navidrome installation at the domain root or under a configured base path.
- Validate the account using the supported `ping` endpoint before saving it.
- Use token-and-salt authentication for normal Subsonic API calls.
- Generate a fresh random salt for each server request.
- Never send the clear-text password as a query parameter.
- Keep the password on the Rust side after login whenever possible.
- Store remembered credentials in Windows Credential Manager.
- Allow the user to test the connection again from Settings.
- Provide a clear logout action that deletes the saved credential and local session data.
- Distinguish invalid credentials, permission failures, unreachable host, DNS failure, TLS failure, timeout, and incompatible API responses.
- Never offer an "ignore certificate errors" switch.
- Allow plain HTTP only for an explicitly accepted private-LAN server and show a warning before saving it.

The first release supports Navidrome's normal built-in authentication. Reverse-proxy single sign-on and externalised authentication are separate future work.

### 8.2 Home screen

The home screen is composed of reorderable sections. Initial sections should include:

- Recently added albums.
- Recently played albums.
- Frequently played albums.
- Favourite albums.
- Favourite tracks.
- Random albums.
- Pinned playlists.
- Continue listening, when a saved queue or resumable item is available.
- Track Mix entry point.

Later sections should include:

- Most played tracks.
- Recently added tracks.
- Forgotten favourites.
- Rediscover this year.
- New but unplayed.
- Suggested from current track.
- Suggested from current artist.
- Decade mix.
- Genre mix.
- Personal weekly and monthly summaries.

Each home section must have loading, empty, error, and refresh states. It must not show fabricated demo data after a real profile has been configured.

### 8.3 Search

Search must:

- Search artists, albums, and tracks.
- Debounce requests while the user types.
- Group results by type.
- Support keyboard navigation.
- Show artwork where available.
- Make it possible to play a track, play an album, enqueue, play next, favourite, and open details.
- Preserve the query when navigating back.
- Link every result's artist and album metadata to the corresponding library detail view when Navidrome supplies an opaque ID.

### 8.4 Albums

Album browsing must support:

- Alphabetical browsing.
- Recently added, frequently played, recently played, highest rated, random, year, and genre views where supported.
- Pagination or incremental loading for large libraries.
- Album detail pages with cover art, artist, year, genre, duration, disc grouping, and track list.
- Play, shuffle, play next, add to queue, favourite, rating, and playlist actions.
- Compilation and multi-disc album handling.

### 8.5 Artists

Artist browsing must support:

- Alphabetical artist listing.
- Artist details with artwork or fallback image.
- Albums grouped sensibly by release type when metadata allows.
- Play all, shuffle, favourite, similar tracks, and artist-radio actions.
- A graceful fallback when external similar-artist metadata is unavailable.

### 8.6 Tracks

Track views must support:

- Title, artist, album, year, genre, duration, track/disc number, play count, rating, and favourite state where returned.
- Sort and filter controls.
- Context actions: play, play next, add to queue, start track mix, favourite, rate, add to playlist, open album, and open artist.
- String identifiers throughout the application. Track, album, artist, playlist, and library IDs must never be coerced to integers.
- Exact navigation by indexed genre and mood tags, with tag-level track and album counts.
- Consistent artist, album, genre, and tag links across search, discovery, queue, playback, playlist, and statistics surfaces.

### 8.7 Playlists

The application must support:

- Listing playlists visible to the authenticated user.
- Opening a playlist and playing it in order or shuffled.
- Creating a playlist.
- Renaming and deleting a playlist owned by the user.
- Adding and removing tracks.
- Reordering tracks where supported.
- Correct handling of server-side smart playlists as read-only dynamic playlists.
- Pinning playlists to the home screen as a client-side preference.

### 8.8 Playback controls

The persistent player and Now Playing page must provide:

- Play and pause.
- Previous and next.
- Seek.
- Volume and mute.
- Queue position.
- Shuffle.
- Repeat off, repeat queue, and repeat one.
- Current artwork, title, artist, and album.
- Elapsed and remaining time.
- Favourite toggle.
- Rating control where appropriate.
- Open album and open artist actions.
- Error recovery and a clear message when a stream fails.

Playback must not restart merely because the user changes route, opens a menu, resizes the window, or opens the mini player.

### 8.9 Queue

Queue behaviour is a core product feature and must be deterministic.

Required actions:

- Replace queue and play now.
- Play next.
- Add to end.
- Remove an item.
- Clear queue.
- Reorder by drag and keyboard controls.
- Jump to an item.
- Save queue changes locally immediately.
- Periodically save the queue to Navidrome when supported.
- Restore the previous queue, current item, and approximate position after restart.

Duplicate tracks are allowed in the local queue. If a server queue endpoint cannot preserve duplicates, the local queue remains authoritative and the limitation is recorded rather than silently deleting duplicates.

### 8.10 Playback reporting and play counts

The application must:

- Send a "now playing" notification after media actually begins playing.
- Submit one completed scrobble per playback session after the user has genuinely listened to the required threshold.
- Use actual listened time rather than immediately counting a track after the user seeks near the end.
- Avoid double scrobbles caused by React rerenders, pause/resume cycles, route changes, or retry logic.
- Continue to work if an optional external scrobbling integration is not configured on the server.

Product rule for the initial implementation:

- A track shorter than 30 seconds is not submitted as completed.
- For longer tracks, submit after actual listened time reaches the earlier of 50 percent of duration or 240 seconds.
- Submit immediately on natural track end if that threshold has already been reached but the normal submission call has not completed.

### 8.11 Mini player

The mini player should be a separate compact window that controls the same playback session as the main window.

Required controls:

- Artwork.
- Track title and artist.
- Play/pause.
- Previous and next.
- Progress and seeking.
- Volume.
- Favourite.
- Expand to main window.
- Always-on-top toggle.
- Close or hide without stopping playback.

There must never be a second independent audio element in the mini player. One playback owner controls audio; all windows observe and control that shared state.

### 8.12 System tray and Windows integration

Later MVP phases must add:

- System-tray icon.
- Show/hide main window.
- Open mini player.
- Play/pause, previous, and next from the tray menu.
- Optional close-to-tray behaviour.
- Global media-key handling.
- Windows media-session metadata and transport controls where technically reliable.
- Native notifications for track changes, configurable by the user.
- Optional launch at Windows sign-in.
- Single-instance behaviour.

### 8.13 Lyrics

The player should support:

- Plain lyrics.
- Synchronized lyrics when returned by a supported extension.
- A resizable lyrics panel.
- Clear empty states when lyrics are not available.
- No automatic scraping of unapproved lyric websites.

### 8.14 Visualisations

The initial visualiser pack should include:

- Frequency bars.
- Mirrored spectrum.
- Oscilloscope waveform.
- Circular spectrum.
- Album-art ambient glow.
- Full-screen visualiser mode.

Later visualisers may include particles and WebGL scenes.

Requirements:

- Visualisers consume analyser data from the one active playback graph.
- Visualisers do not fetch or decode the track independently.
- Switching visualisers does not interrupt playback.
- A visualiser can be disabled automatically on low performance.
- Rendering should target 60 frames per second but degrade gracefully.
- The first release bundles trusted visualiser modules. Loading arbitrary downloaded JavaScript is out of scope.

### 8.15 Settings

Settings should eventually include:

- Server profile and connection test.
- Logout.
- Theme and density.
- Home-section order and visibility.
- Close-to-tray.
- Always-on-top default for mini player.
- Notifications.
- Startup behaviour.
- Streaming quality and transcoding preference.
- Gapless/crossfade controls when implemented.
- ReplayGain mode when implemented.
- Visualiser selection and quality.
- Track Mix familiarity slider and explicit-content rules if metadata permits.
- Cache size and clear-cache action.
- Diagnostics export with secrets redacted.

## 9. Track Mix product design

Track Mix is not equivalent to pure shuffle. It should deliberately combine familiar tracks and discovery while avoiding obvious repetition.

### 9.1 Inputs

Candidate sources may include:

- Favourites and highly rated tracks.
- Frequently played tracks.
- Underplayed or never-played tracks.
- Recently added tracks.
- Random tracks filtered by genre, year, or library.
- Similar tracks returned for a seed track or artist.
- Tracks from selected playlists.
- Local recent-play and skip history.

### 9.2 Default recipe

The first complete mix engine should start with approximately:

- 30 percent familiar favourites and frequently played tracks.
- 25 percent underplayed or never-played tracks.
- 20 percent related tracks from the selected seed.
- 15 percent recently added tracks.
- 10 percent broad discovery.

These proportions are targets, not guarantees. The engine must fill from available sources and record why a source was unavailable.

### 9.3 Ranking and constraints

The mix engine should:

- Exclude tracks already selected for the same mix unless duplicates are explicitly allowed.
- Penalise tracks played very recently.
- Penalise tracks skipped repeatedly.
- Avoid adjacent tracks by the same artist unless the source is an album.
- Avoid excessive tracks from the same album.
- Respect selected libraries, genres, years, and playlists.
- Prefer a range of artists and eras.
- Return a useful queue even when similar-song data is unavailable.
- Expose a simple Familiar to Adventurous slider.
- Produce an explanation for each selected track in debug mode, such as "favourite", "underplayed", "related to seed", or "recently added".

### 9.4 Mix types

Planned mix recipes:

- Track Mix.
- Artist Radio.
- Song Radio.
- Genre Mix.
- Decade Mix.
- Recently Added Mix.
- Forgotten Favourites.
- Rediscover a Year.
- Low-Play-Count Discovery.

## 10. Local listening statistics

Navidrome remains the source of truth for server play counts, but the client may store local playback events for richer desktop-only analytics.

Potential statistics include:

- Listening time by day, week, month, and year.
- Top tracks, artists, albums, and genres.
- Completion and skip rates.
- Discovery ratio.
- Newly added tracks played.
- Longest listening session.
- Time-of-day listening patterns.

The application must clearly label statistics that are based only on plays observed by this desktop client. It must not claim to represent all listening across every device unless the server exposes complete history through a supported API.

## 11. Data ownership and synchronisation

### 11.1 Server-owned data

- User account and permissions.
- Music files and metadata.
- Libraries.
- Favourites/stars.
- Ratings.
- Playlists.
- Play count and last-played information updated through scrobbling.
- Server queue where supported.

### 11.2 Client-owned data

- Window positions and sizes.
- Theme and UI preferences.
- Home-section order.
- Pinned sections and playlists.
- Mini-player preferences.
- Local queue snapshot.
- Local playback events and skip history.
- Local artwork and metadata cache.
- Visualiser settings.
- Mix-engine settings.

### 11.3 Conflict rules

- Server data wins for server-owned fields.
- Local UI preferences win for client-owned fields.
- Playlist edits should be confirmed by a successful server response before the UI treats them as durable.
- Optimistic updates are allowed only when rollback is implemented.

## 12. UX and visual direction

The interface should feel like a dedicated music application rather than an admin dashboard.

Principles:

- Artwork-led but not visually noisy.
- Dark-first design with a later light option.
- Strong hierarchy and generous spacing.
- Compact, information-rich track rows.
- Consistent right-click and overflow menus.
- Smooth but restrained animation.
- Keyboard-first operation for playback and search.
- Clear focus states.
- No low-contrast text over artwork without a protective surface or gradient.
- No permanent mock content in production views.

## 13. Accessibility requirements

- All primary actions are keyboard reachable.
- Visible focus indication.
- Semantic buttons and labels.
- Screen-reader labels for icon-only controls.
- Sufficient contrast.
- Reduced-motion support.
- Do not rely on colour alone for state.
- Seek and volume controls expose accessible values.
- Queue reordering has a keyboard alternative.
- Mini-player controls remain usable at Windows display scaling above 100 percent.

## 14. Performance requirements

Targets for a normal desktop and a large personal library:

- Application shell visible within 2 seconds after process start, excluding a cold Windows security scan.
- Previously cached home data visible quickly while a background refresh runs.
- Search request begins within 300 milliseconds after typing stops.
- Route changes do not recreate the playback engine.
- Artwork is lazy-loaded and cached.
- Album and artist lists use pagination or virtualisation when necessary.
- Visualisers should not make audio controls unresponsive.
- Network calls have explicit timeouts and cancellation.
- No full-library download is required for the first usable screen.

## 15. Security and privacy requirements

- Password stored only in Windows Credential Manager when remembered.
- No secret in localStorage, sessionStorage, source, environment files committed to Git, plain settings files, logs, crash reports, or analytics.
- Navidrome requests are created by the Rust backend.
- Authenticated Navidrome URLs are not exposed to the webview or copied to logs.
- A local media proxy may expose only an unguessable per-process session token, never the Navidrome password or reusable server-auth parameters.
- Local proxy binds only to loopback and accepts only the required media routes.
- Tauri capabilities follow least privilege.
- Content Security Policy remains enabled.
- TLS validation remains enabled.
- Diagnostics redact username if requested and always redact passwords, tokens, salts, and authenticated query strings.
- No telemetry is sent by default.

## 16. Reliability requirements

- A temporary server outage does not discard the local queue.
- Failed background requests show stale cached data where safe.
- Playback errors do not crash the application.
- A failed scrobble is retried with idempotency protection and a bounded queue.
- Invalid cached data can be cleared from Settings.
- App updates and schema migrations preserve settings and credentials.
- The app does not repeatedly retry an invalid password and lock the user into an error loop.

## 17. Delivery phases

### Phase 1 - Functional vertical slice

- Local Tauri project.
- Secure Navidrome login.
- Connection validation.
- Newest albums.
- Album detail and tracks.
- Artwork.
- Basic playback and persistent player.
- Correct now-playing and completed scrobble behaviour.
- Logout.
- Automated tests for auth construction, response parsing, and player state.

### Phase 2 - Core library client

- Full search.
- Artists, albums, tracks, genres, favourites, and playlists.
- Queue editing and persistence.
- Recently played and frequently played sections.
- Error and empty states.
- Buildable Windows installer.

### Phase 3 - Desktop experience

- Mini player.
- Tray.
- Close-to-tray.
- Media keys and Windows media integration.
- Notifications.
- Queue synchronisation with Navidrome.

### Phase 4 - Discovery

- Track Mix.
- Artist and song radio.
- Most-played tracks.
- Forgotten favourites.
- Home-section customisation.
- Local listening-event database.

### Phase 5 - Visual and audio polish

- Visualiser pack.
- Full-screen visualiser.
- Synchronized lyrics.
- ReplayGain and gapless validation.
- Optional MPV backend investigation.
- Crossfade if it does not compromise gapless playback.

### Phase 6 - Distribution and maintenance

- Signed installer strategy.
- Updater.
- Migration tests.
- Release notes and diagnostics export.
- Optional multi-profile support.

## 18. MVP acceptance criteria

The MVP is ready for daily personal use when:

1. It installs and launches on the user's Windows desktop.
2. It connects to the existing Navidrome server using a normal Navidrome account.
3. It remembers the login securely without storing a plaintext password in application files.
4. It presents real library data for home, search, albums, artists, tracks, and playlists.
5. It streams a full album without the UI losing playback state.
6. Play, pause, previous, next, seek, volume, shuffle, repeat, and queue controls work consistently.
7. Favourites and playlist changes survive refresh and are reflected in Navidrome.
8. Scrobbling updates play count exactly once per qualifying play.
9. The main window can be hidden while playback continues.
10. The mini player controls the same playback session.
11. A restart restores the local queue and current item.
12. Common errors are understandable and do not expose secrets.
13. `npm test`, frontend type checking, Rust tests, Clippy, and a release build all pass.

## 19. Open product decisions

These decisions should be made after the first vertical slice, based on hands-on testing:

- Final product name and visual identity.
- Whether the long-term playback backend remains Web Audio/HTML media or moves to MPV.
- Exact Windows media-session implementation.
- Whether local statistics should import any server history if a supported endpoint becomes available.
- Whether third-party visualiser packages will ever be allowed.
- Whether multi-server profiles are important enough for the first public release.
- Whether offline downloads are worth the security, storage, and synchronisation complexity.
