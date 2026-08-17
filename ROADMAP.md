# Navidrome Desktop roadmap status

Updated 17 August 2026. This document records what is implemented, what was validated, and which distribution items require release-owner inputs.

## Delivered

### Phase 1 — functional vertical slice

- Secure token-and-salt login, Windows Credential Manager persistence, startup restoration, and logout.
- Typed Navidrome client, newest albums, album details, artwork/audio loopback proxy, persistent player, and idempotent scrobbling.
- CSP/TLS protections, redacted errors/logging, and mock-server coverage.

### Phase 2 — core library client

- Search plus album, artist, track, genre, favourite, and playlist navigation.
- Album and playlist mutations for favourites, ratings, create, rename, delete, add, remove, and reorder.
- A persistent full-library SQLite-backed metadata index. Search covers title, artist, album, genres, moods, file type, comments, MusicBrainz ID, and display tags.
- Whole-library sorting for title, artist, album, year, genre, numeric duration, track/disc, play count, rating, favourite state, bitrate, bit depth, sample rate, channels, size, file type, created date, and BPM.
- Deterministic local queue editing with duplicate occurrences, restart persistence, and periodic Navidrome queue synchronization.

### Phase 3 — desktop experience

- One playback owner shared through events with a separate always-on-top mini-player window.
- Tray show/mini/player controls, close-to-tray, single-instance focus, native notifications, and Windows Media Session transport metadata/actions.

### Phase 4 — discovery

- SQLite playback events and desktop-only listening statistics.
- Deterministic Track Mix, artist/song radio, genre/decade/recent/forgotten-favourite/year/low-play recipes.
- Familiar-to-adventurous control, source reasons, warnings, duplicate prevention, artist spacing, and album caps.
- Reorderable/optional Home sections and pinned playlists.

### Phase 5 — visual and audio polish

- One shared Web Audio analyser and five visualisers: bars, mirror, waveform, circular spectrum, and ambient artwork.
- Quality controls, reduced-motion handling, animation cleanup, and full-screen visualisation.
- Plain and synchronized OpenSubsonic lyrics with current-line highlighting and safe unavailable/error states.

### Phase 6 — distribution and maintenance

- SQLite schema migrations and backward-compatible defaults for persisted settings.
- Redacted diagnostics export, release checklist, data documentation, and user guide.
- Release builds produce the configured NSIS/MSI targets when allowed by the Windows code-integrity policy.

## Deliberate product decisions

- HTML media remains the playback backend. MPV would add a second native playback architecture, packaging surface, and security/update burden. It should be adopted only after measured failures in codec support, gapless playback, ReplayGain, or device selection.
- Crossfade is not enabled. A reliable implementation conflicts with the single-media-element invariant and can compromise gapless transitions.
- ReplayGain and exact gapless behavior depend on server transcoding and WebView2 media support. They remain validation items against the owner’s real library rather than settings that imply guarantees the engine cannot make.
- Multi-profile foundations exist through stable profile IDs and profile-scoped local data, but the UI intentionally exposes one current profile to avoid ambiguous credential and playback ownership.

## Release-owner inputs still required

These are not safely inventable in source:

1. A Windows code-signing certificate and protected signing workflow.
2. A stable HTTPS update manifest/download endpoint.
3. A Tauri updater public key whose private key is held outside the repository.
4. Final product name, publisher identity, versioning policy, and release channel.

After those inputs exist, add the official updater plugin, embed only the public verification key, sign bundles in CI or a protected release workstation, test upgrade/rollback from the previous version, and publish release notes. Never commit a signing certificate, private updater key, or password.

## Verification record

The source-level gate is `npm run verify`. A real-account smoke test is intentionally manual and is documented in [USER_GUIDE.md](USER_GUIDE.md) and [DEVELOPMENT.md](DEVELOPMENT.md).
