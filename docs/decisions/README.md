# Architecture decision records

Architecture decision records preserve the context, alternatives, and consequences of choices that are expensive or risky to reverse.

## Decision index

| Decision                                               | Status   | Summary                                                                |
| ------------------------------------------------------ | -------- | ---------------------------------------------------------------------- |
| ADR-001                                                | Accepted | Build a local installed client, not another server-hosted application  |
| ADR-002                                                | Accepted | Keep all Navidrome networking behind the Rust Tauri facade             |
| ADR-003                                                | Accepted | Let Rust own platform credential storage                               |
| ADR-004                                                | Accepted | Stream through a narrow loopback media proxy                           |
| ADR-005                                                | Accepted | Start with HTML media and evaluate MPV only against measured needs     |
| ADR-006                                                | Accepted | Keep server-owned and client-owned data distinct                       |
| [ADR-007](ADR-007-local-index-and-history.md)          | Accepted | Use SQLite for the profile-scoped metadata index and local history     |
| [ADR-008](ADR-008-one-player-multiple-windows.md)      | Accepted | Keep one player and make secondary windows event-driven views          |
| [ADR-009](ADR-009-trusted-hybrid-visualizer-engine.md) | Accepted | Use trusted built-in Canvas/WebGL visualisers over one analyser        |
| [ADR-010](ADR-010-android-adaptive-shell.md)           | Accepted | Share one adaptive route and playback shell across Windows and Android |

ADR-001 through ADR-006 currently live in the [architecture decision summary](../../ARCHITECTURE.md#21-architecture-decisions-and-trade-offs). New decisions should use a dedicated file in this directory and be added to this index.

## When to add a decision

Add or supersede an ADR when a change affects a durable boundary such as credentials, remote networking, playback ownership, local persistence, platform lifecycle, executable content, or distribution security. Implementation details that are easy to reverse do not need an ADR.
