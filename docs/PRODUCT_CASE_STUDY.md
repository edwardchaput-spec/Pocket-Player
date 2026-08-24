# Pocket Player product case study

## Executive summary

Pocket Player explores a focused product question: how can a self-hosted music library feel as convenient and intentional as a dedicated music service without adding another cloud account, moving media ownership, or weakening credential security?

The answer is a local Navidrome client centred on dependable playback, fast retrieval, native device controls, and explainable discovery. The implementation is substantial, but this is still a portfolio alpha: source-level verification exists, while broader user validation, signed distribution, and outcome measurement remain open.

## Product snapshot

|                       |                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Audience**          | Privacy-conscious listeners who already run Navidrome and use it regularly             |
| **Job-to-be-done**    | Listen to and rediscover a personal library without managing a browser tab             |
| **Initial scope**     | One active profile, online streaming, Windows-first installed experience               |
| **Current extension** | Shared adaptive Android interface in technical preview                                 |
| **North-star idea**   | More satisfying personal-library listening without surrendering ownership or trust     |
| **Product posture**   | Owner-operated hypothesis with clear requirements; no claim of broad market validation |

This repository demonstrates work across opportunity framing, product strategy, requirements, non-goals, phased prioritisation, UX direction, acceptance criteria, risk management, technical trade-offs, and validation design. It does not infer interviews, adoption, or commercial outcomes that have not occurred.

## The opportunity

Navidrome solves the server problem: it indexes, serves, and synchronises access to a personally owned music collection. Its web client is useful, but daily listening still competes with browser tabs and lacks some of the persistent, system-level behaviour people expect from a dedicated player.

The initial first-party hypothesis is:

> When I listen to my Navidrome library every day, I want reliable playback and system controls without managing a browser tab, so my private collection feels like a dedicated music service.

Three needs sit underneath that job:

1. **Confidence:** playback, queue state, mutations, and scrobbles behave predictably.
2. **Convenience:** music remains controllable from persistent, compact, and system surfaces.
3. **Rediscovery:** a large personal library becomes easier to explore without opaque recommendation logic.

## Product principles

1. **Navidrome remains the source of truth.** The client should not become a second media server or create ambiguous ownership of shared data.
2. **Trust is part of the experience.** Credentials, authenticated URLs, and personal listening data need explicit boundaries, not a late security pass.
3. **Playback continuity outranks feature novelty.** Discovery and visual polish matter only after the daily listening loop is stable.
4. **Recommendations should be inspectable.** A listener should be able to understand why a track entered a mix and change the familiar/discovery balance.
5. **Local insight must be labelled honestly.** Device-observed history cannot be presented as complete cross-client behaviour.
6. **Complex capabilities need evidence.** MPV, crossfade, offline storage, multiple profiles, and public distribution remain gated by a demonstrated need or prerequisite.

## Scope and prioritisation

The roadmap follows a risk-first sequence:

| Stage                 | Product question                                                                              | Work used to answer it                                                           |
| --------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Trust and playback | Can the app connect, stream, and report a play without exposing secrets or duplicating state? | Secure login, Rust networking, loopback proxy, persistent player, scrobble rules |
| 2. Daily library job  | Can a listener replace the normal browser workflow?                                           | Search, browse, favourites, ratings, playlists, queue, persistence               |
| 3. Device convenience | Does an installed app materially reduce friction?                                             | Mini player, tray, media keys, notifications, close-to-tray, single instance     |
| 4. Differentiation    | Can the product help people use more of the library they already own?                         | Explainable mixes, configurable Home, local listening insight                    |
| 5. Polish             | Can richer presentation be added without destabilising audio or increasing trust risk?        | Lyrics, trusted local visualisers, adaptive performance                          |
| 6. Distribution       | What must be true before the project can make a public release claim?                         | Signing identity, updater keys/endpoints, upgrade testing, release policy        |

### Deliberate non-goals

The initial product does not:

- replace or modify Navidrome;
- upload, rename, delete, or edit music files;
- provide offline downloads, iOS, or a public SaaS service;
- promise multiple active profiles;
- scrape private server APIs or third-party lyric websites;
- disable TLS validation or execute downloaded visualiser code;
- claim device-local statistics represent every listening client.

These boundaries concentrate effort on the core job and reduce security, synchronisation, and distribution risk.

## Decisions and trade-offs

### Rust-owned networking

**Decision:** The React webview calls a typed Tauri facade; Rust creates all Navidrome requests and owns credentials.

**Why:** This keeps reusable authentication material and upstream media URLs out of browser state, avoids CORS-driven design compromises, and centralises validation and redaction.

**Cost:** Every supported server operation needs a typed command and model at the boundary.

### One playback owner

**Decision:** One persistent HTML audio element owns playback. The mini player and tray are event-driven controllers.

**Why:** Route changes and secondary windows cannot create duplicate streams, queues, or scrobbles.

**Cost:** Crossfade is deferred, and a later playback-engine change would require a deliberate adapter rather than a second player.

### HTML media before MPV

**Decision:** Prove the product with the platform media stack before adopting a native playback engine.

**Why:** This is the fastest route to streaming and analyser-based visuals with a smaller packaging, security, and update surface.

**Cost:** Codec breadth, exact gapless behaviour, ReplayGain, and output-device selection remain environment-dependent validation items.

### Local index and history

**Decision:** Rust maintains a profile-scoped SQLite metadata cache and playback-event history with an in-memory search index.

**Why:** Large-library filtering, exact tag navigation, and numeric sorting remain responsive, and discovery can use local behaviour without a cloud analytics service.

**Cost:** Local statistics are partial by definition and must be labelled as such.

### One active profile

**Decision:** Keep a single visible current profile in the initial experience.

**Why:** Credential, queue, cache, and playback ownership stay unambiguous while the core product is validated.

**Cost:** People with multiple servers or accounts must wait for evidence to justify a multi-profile UX.

## What exists today

Repository evidence includes:

- a complete product specification with goals, non-goals, requirements, phases, and acceptance criteria;
- a typed React/Rust implementation covering the core library and playback flows;
- mock-server integration coverage that does not require personal credentials;
- dedicated tests for queue behaviour, scrobble thresholds, redaction, library indexing, discovery, and adaptive visuals;
- a single non-interactive `npm run verify` quality gate;
- architecture decision records for indexing/history, playback ownership, trusted visualisers, and the Android adaptive shell;
- a manual release checklist for real-server, playback, mutation, security, and package validation.

These are delivery and quality signals, not customer outcomes. There is no public adoption, retention, satisfaction, or revenue evidence, and the project does not claim otherwise.

## Measurement and validation plan

The product sends no telemetry by default. Measures below are either existing guardrails, targets that still need representative benchmarking, or future local/consented learning signals.

| Outcome                 | Measure                                                                      | State                                             | Collection approach                                                 |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Successful activation   | Connection success and time from launch to first track                       | Baseline pending                                  | Observed setup sessions with test accounts; no credential capture   |
| Responsive retrieval    | Shell visible within 2 seconds; search begins within 300 ms of typing stop   | Targets defined                                   | Representative Windows/Android devices and large fixture libraries  |
| Reliable playback       | Stream-start success, uninterrupted sessions, queue recovery                 | Behaviour implemented; real-library checks manual | Release checklist plus safe local diagnostics                       |
| Correct server history  | Exactly one completed scrobble after the actual-listening threshold          | Automated evidence exists                         | Unit/mock integration tests and disposable real-server verification |
| Useful discovery        | Mix start, play-through, skip rate, repeat use, underplayed-track acceptance | Outcome baseline pending                          | Local-only or explicitly consented event analysis                   |
| User trust              | Plaintext secret, authenticated-URL, and duplicate-play defects              | Zero-tolerance guardrail                          | Automated redaction/boundary tests and release inspection           |
| Distribution confidence | Signed install, update, upgrade, rollback, and uninstall                     | Blocked on release inputs                         | Protected release workflow and version-to-version test matrix       |

If this moves beyond an owner-operated product, the next learning step is five to eight observed sessions with existing Navidrome users across three tasks:

1. connect a server and start an album;
2. recover and edit a listening queue across a restart;
3. generate a mix and explain why its first tracks were selected.

The aim is to identify onboarding failure modes, playback trust issues, and whether explanation improves discovery confidence before adding more recommendation complexity.

## Risk register

| Risk                                     | Product impact                                | Current mitigation                                                        | Remaining proof                                                    |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Credential or authenticated URL exposure | Loss of trust and account compromise          | Rust-owned networking, Credential Manager, loopback token, CSP, redaction | Independent security review and release inspection                 |
| Duplicate playback/scrobbles             | Corrupt history and unreliable controls       | One audio owner, playback-session IDs, duplicate protection               | Extended real-library soak testing                                 |
| Large-library latency                    | Search and browse become frustrating          | SQLite cache, bounded refresh, whole-index filtering/sorting              | Benchmarks with varied large libraries and devices                 |
| Recommendation quality                   | Discovery feels random or repetitive          | Source mix, recency penalties, artist spacing, reasons/warnings           | Observed play-through/skip behaviour and qualitative feedback      |
| Android platform gaps                    | Inconsistent promise across platforms         | Adaptive shell, safe areas, session-only credentials                      | Device matrix, lifecycle/audio, packaging, and Keystore validation |
| Unsigned distribution                    | Installation warnings and unsafe update story | No public release claim                                                   | Publisher identity, protected signing, updater infrastructure      |

## Next product decisions

1. Complete real-library Windows validation and record evidence against the release checklist.
2. Validate Android lifecycle, audio, safe areas, back behaviour, and packaging on representative devices.
3. Create publication-safe screenshots or a short demo using synthetic library data.
4. Observe onboarding and discovery tasks with additional Navidrome users before expanding mix complexity.
5. Decide publisher identity, signing process, release channel, and updater ownership; generate the release-specific third-party notice bundle.
6. Evaluate MPV, multi-profile UX, offline access, or richer analytics only when measured pain justifies their cost.

## Supporting evidence

- [Product specification](../PRODUCT_SPEC.md)
- [Roadmap and delivery status](../ROADMAP.md)
- [Technical architecture](../ARCHITECTURE.md)
- [Architecture decision records](decisions/README.md)
- [User guide](../USER_GUIDE.md)
- [Development and release checklist](../DEVELOPMENT.md)
- [Security policy](../SECURITY.md)

The useful portfolio signal is not the number of features. It is the ordering of decisions: trust and playback risks were addressed first, differentiation followed the reliable daily job, and expensive capabilities remain gated by evidence rather than roadmap momentum.
