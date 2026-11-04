# ADR-011: Native Android playback output for background audio and Android Auto

## Status

Accepted (November 2026). Implemented in source. On 4 November 2026 login, native playback, and the Android Auto browse, search, track selection, and transport controls passed on a Pixel 10 Pro (Android 17, Android Auto 17.9) using the Desktop Head Unit. A wider device matrix and long-running background sessions are still outstanding.

## Context

The Android build originally played audio through the webview's HTML audio element, routed through a Web Audio analyser for the visualisers. That works only while the app is in the foreground:

1. **Background playback was not guaranteed.** Android only keeps media playing reliably when a foreground `MediaSessionService` with a media notification owns it.
2. **Android Auto cannot show a webview.** A media app appears in Android Auto only through a `MediaBrowserService` / Media3 `MediaLibraryService`. The head unit draws its own touch-operable templates (browse tree, search, Now Playing). The app supplies data, not layout.
3. **Visualisers cannot run on the car screen.** Driver-distraction rules forbid animated content from music apps on the head unit. Visualisers remain a phone and tablet feature.

## Decision

On Android, the single audio output moves from the HTML audio element into a native Media3 service. The webview remains the queue authority.

- The `pocket-playback` Tauri plugin (`src-tauri/plugins/pocket-playback`) ships a Kotlin `PlaybackService : MediaLibraryService`. The service owns one ExoPlayer, the media notification, audio focus, becoming-noisy handling, and the `MediaSession` used by the lock screen, Bluetooth, and Android Auto.
- The webview pushes the queue in play order (`set_queue`). Native items are keyed by queue occurrence ID, so duplicate tracks coexist. Because native holds the whole queue, it advances on its own while the screen is off, and next/previous work from any media surface.
- `NativePlaybackSync` (`src/features/player/nativePlaybackSync.ts`) mirrors native track transitions back into the playback store. Every mirrored change is a no-op on the way back, so the two sides never ping-pong. Scrobbling and local history keep using the shared reporter, driven by native position events.
- Audio streams only from the Rust loopback proxy. The plugin refuses any proxy URL that is not `http://127.0.0.1` and any queue URL outside `<proxy>/stream/`. Credentials and authenticated Navidrome URLs never reach Kotlin.
- **Android Auto browse tree:** the service reads read-only `/auto/children` and `/auto/tracks` endpoints on the token-protected loopback proxy. Those endpoints refuse any request carrying a browser `Origin`, and they validate node strings and opaque IDs in Rust (`src-tauri/src/auto_catalog.rs`). Choosing a track queues its whole album, playlist, or result list, and the webview adopts that queue without pushing it back.
- **Controller allow-list:** only this app, the system media notification, Android Auto / Automotive, and trusted system controllers may connect to the session. Other apps cannot browse the library.
- **Visualisers:** a pass-through Media3 `AudioProcessor` (`SpectrumTap`) computes 1024-point spectra with Web Audio byte semantics. Frames stream to the webview only while a visualiser is actually reading them (`NativeSpectrumAnalyser`), so a hidden visualiser costs nothing.
- **Network security:** release builds allow cleartext only to `127.0.0.1` for the loopback proxy. Debug builds also allow the LAN Vite dev server.
- **TLS:** `rustls-platform-verifier` is initialised over JNI at startup (`src-tauri/src/android_tls.rs`), and its Kotlin component is bundled from the crate's Maven directory, so Navidrome HTTPS uses Android's own certificate verifier.

Windows is unchanged: one HTML audio element remains the output there.

## Consequences

- Reliable background, lock-screen, Bluetooth, and Android Auto playback while the app process is alive.
- Android Auto works only after the user has signed in during the current process, because Android credentials are still session-only. If the process has died, the car shows an empty library until the app is opened. Auto playback with the phone locked from a cold start therefore depends on the Keystore-backed credential store on the roadmap.
- Shuffling or reordering the queue re-sends the native playlist, which re-buffers the current track briefly. Incremental native queue edits can remove that later.
- Spectrum frames are taken before the audio sink buffer, so visuals lead the audio by up to the sink buffer length (roughly a quarter of a second).
- Two output implementations behind one store contract: frontend unit tests cover the sync logic, while the Kotlin service needs device and DHU testing.
