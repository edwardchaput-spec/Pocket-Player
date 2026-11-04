# Pocket Player roadmap and delivery status

Updated 24 August 2026. This document separates implementation evidence from real-device validation, external release dependencies, and future bets. “Implemented in source” does not mean publicly released or production-validated.

## Implemented in source

### 1. Secure playback vertical slice

- Token-and-salt login, Windows Credential Manager persistence, startup restoration, and logout.
- Typed Navidrome client, newest albums, album details, artwork/audio loopback proxy, persistent player, and duplicate-protected scrobbling.
- CSP/TLS protections, redacted errors/logging, and mock-server coverage.

### 2. Core library client

- Search plus album, artist, track, genre, favourite, and playlist navigation.
- Favourites, ratings, and playlist create, rename, delete, add, remove, and reorder operations.
- A persistent full-library SQLite-backed metadata index covering core metadata, genres, moods, technical fields, comments, MusicBrainz IDs, and display tags.
- An exact Tags catalogue with category, track, and distinct-album counts.
- Consistent opaque-ID artist and album navigation across library, search, queue, playback, playlist, and statistics surfaces.
- Whole-library sorting before pagination, including numeric duration and technical metadata.
- Deterministic local queue editing with duplicate occurrences, restart persistence, and periodic Navidrome queue synchronisation.

### 3. Windows experience

- One playback owner shared through events with a separate always-on-top mini-player window.
- Tray controls, close-to-tray, single-instance focus, native notifications, and Windows Media Session transport metadata/actions.

### 4. Discovery and local insight

- SQLite playback events and clearly labelled installation-only listening statistics.
- Explainable discovery recipes with a Familiar-to-Adventurous control, source reasons, warnings, duplicate prevention, artist spacing, and album caps.
- Reorderable/optional Home sections and pinned playlists.

### 5. Visual and audio polish

- One shared Web Audio analyser and 22 trusted visualisers spanning Canvas and WebGL scenes.
- Preset categories, favourites, sensitivity, quality, rotation, random mode, fullscreen controls, GPU diagnostics, adaptive frame/resolution/complexity control, reduced-motion handling, and paused/off-screen suspension.
- Plain and synchronised OpenSubsonic lyrics with safe unavailable and error states.
- A desktop-shortcut workflow that launches the local release executable without a development server.

### 6. Maintenance foundations

- Forward-only SQLite schema migrations and backward-compatible persisted-setting defaults.
- Redacted diagnostics export, user/development documentation, and a manual release checklist.
- Local release configuration for Windows NSIS/MSI bundles when the Windows code-integrity policy permits the build.

## Validation and release readiness

| Area                     | Current state                                                                                                                                                                                                                                                                                                             | Exit evidence                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Source quality gate      | `npm run verify` covers frontend and Rust checks                                                                                                                                                                                                                                                                          | A passing run recorded for the release revision                                                                                    |
| Windows real-library use | Manual checklist is documented; results are environment-specific                                                                                                                                                                                                                                                          | Playback, mutation, proxy, scrobble, restart, diagnostics, and failure-path checks completed on a disposable/owned account         |
| Windows packaging        | Local NSIS/MSI targets are configured; packages are unsigned                                                                                                                                                                                                                                                              | Signed install/uninstall on supported Windows versions                                                                             |
| Android                  | Adaptive shell, native Media3 playback service, Android Auto browse tree, and session-only credentials are implemented as a technical preview (ADR-011). Login, native playback, and the Android Auto browse, search, selection, and transport flow passed on a Pixel 10 Pro with the Desktop Head Unit (4 November 2026) | Wider device matrix, long background/lock-screen sessions, back navigation, safe areas, package, and secure persistence validation |
| Public release           | MIT licence selected; no supported release channel exists                                                                                                                                                                                                                                                                 | Publisher identity, third-party notice bundle, signed artifacts, release notes, and support posture                                |
| Automatic updates        | Not implemented                                                                                                                                                                                                                                                                                                           | Protected updater key, stable HTTPS endpoint, upgrade/rollback testing                                                             |

## External inputs required for distribution

These cannot be safely invented in source:

1. A final publisher identity, versioning policy, and release channel.
2. A Windows code-signing certificate and protected signing workflow.
3. A stable HTTPS update manifest/download endpoint.
4. A Tauri updater public key whose private key is held outside the repository.
5. For Android distribution, a protected signing identity and Play Console release process.

After those inputs exist, add the official updater, embed only public verification material, sign bundles in a protected workflow, test upgrade and rollback from the previous version, and publish release notes. Never commit a certificate, private key, or password.

## Evidence-triggered later bets

- **MPV playback:** evaluate only after measured failures in codec support, gapless playback, ReplayGain, or output-device selection justify a second native playback architecture.
- **Crossfade:** retain the one-player invariant unless user value clearly outweighs the playback and scrobble complexity.
- **Multiple active profiles:** add only when multi-server/account demand justifies new credential, cache, and playback ownership UX.
- **Offline downloads:** revisit only with a clear use case and an explicit storage, encryption, expiry, and synchronisation design.
- **iOS:** remains outside the initial platform strategy.
- **Broader analytics:** require an explicit privacy decision; local statistics must never be presented as complete server history.

## Verification record

The source-level gate is `npm run verify`. Automated integration tests use local mock servers and never require personal credentials. A real-account smoke test is intentionally manual and documented in [DEVELOPMENT.md](DEVELOPMENT.md); operating instructions are in [USER_GUIDE.md](USER_GUIDE.md).

Release notes should record the exact revision, automated result, manual environments, checks completed, known limitations, and any skipped validation. Until that record and signed artifacts exist, describe the project as a portfolio alpha rather than a public release.
