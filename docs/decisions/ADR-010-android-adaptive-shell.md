# ADR-010: Android adaptive application shell

## Status

Accepted.

## Decision

Pocket Player uses one route tree, one `PlayerProvider`, and one HTML audio element across Windows and Android. The application shell adapts by available width instead of maintaining a separate mobile frontend:

- Compact widths below 600 CSS pixels use a top app bar and five bottom destinations: Home, Search, Library, Playlists, and More.
- Medium widths from 600 through 839 CSS pixels use a navigation rail.
- Expanded widths from 840 CSS pixels use the full desktop sidebar.
- Library and More are hub routes that keep every existing destination reachable without overloading compact navigation.
- The compact persistent player floats immediately above bottom navigation and links to the full Now Playing surface. Playback ownership never moves out of `PlayerProvider`.

The Android webview opts into edge-to-edge rendering. The viewport uses `viewport-fit=cover`, and compact surfaces consume CSS safe-area insets for status bars, gesture navigation, and display cutouts. Interactive controls are at least 48 CSS pixels on compact widths, and reduced-motion preferences remain respected.

Android system back continues to use Tauri/Wry webview history. Detail screens also expose a deterministic app-bar Up action to their collection parent; this does not replace system Back history.

## Consequences

- Desktop navigation and desktop-only integrations remain unchanged at expanded widths.
- Rotation and larger Android screens can move naturally from bottom navigation to a rail or sidebar without user-agent checks.
- Search, queue, settings, statistics, visualisers, and every library route retain the same typed Tauri facade and Rust-owned networking.
- Android passwords remain process-memory-only until a separately reviewed, Keystore-backed credential implementation is available.
- Compact layout, safe-area behavior, touch targets, orientation changes, and system Back behavior require device-level Android release checks in addition to frontend unit tests.
