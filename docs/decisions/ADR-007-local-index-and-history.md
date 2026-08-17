# ADR-007: SQLite metadata index and local history

## Status

Accepted.

## Decision

Rust owns one SQLite database in the Tauri application-data directory. It stores a profile-scoped metadata cache and append-only playback events with schema migrations. The active library is also held in a compact in-memory search representation for responsive filtering and sorting.

## Consequences

- Full-library duration and numeric metadata sorts are correct across pagination boundaries.
- Tag search does not require a network round trip per keystroke.
- Cached library data can be shown/refreshed independently of Navidrome availability.
- Navidrome remains authoritative for shared metadata, favourites, ratings, playlists, and play counts.
- Statistics must be labelled desktop-only because events from other clients are not present.
- Rust exposes typed operations only; the webview cannot execute arbitrary SQL.
