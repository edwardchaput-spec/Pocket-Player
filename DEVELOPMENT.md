# Pocket Player development

Pocket Player is built and run directly on Windows. It connects to an existing Navidrome server; no Docker, VM, LXC, remote SSH host, or server-side component is used.

This guide documents the reproducible Windows workflow and the Android technical-preview build. Android device-matrix validation, signing, and Keystore-backed credential persistence are not yet a supported release workflow.

## Windows prerequisites

This repository currently uses Tauri 2.11.x and requires:

- Windows 10 or 11 with the Microsoft Edge WebView2 Runtime (normally included with current Windows).
- Node.js 22 or newer and npm. The scaffold was verified with Node 26.5.0 and npm 11.17.0.
- Rust stable using the `x86_64-pc-windows-msvc` toolchain, with `rustfmt` and `clippy`. The installed toolchain at scaffold time was Rust 1.97.1.
- Microsoft Visual Studio Build Tools with **Desktop development with C++**, the MSVC x64/x86 build tools, and a Windows SDK. Build Tools 18 is present on the development machine.

Install Rust from <https://rustup.rs>, then open a new terminal and run:

```powershell
rustup default stable-x86_64-pc-windows-msvc
rustup component add rustfmt clippy
```

Do not use a Linux or remote build for the Windows bundle.

## Local setup

From the repository root in a new PowerShell or Command Prompt window:

```powershell
npm install
```

If PowerShell execution policy blocks `npm.ps1`, use the executable shim without changing system policy:

```powershell
npm.cmd install
```

No `.env` file is required. Never put a real server address or credentials into source or environment files.

## Commands

```powershell
npm run tauri dev        # Start the complete local Windows app
npm run dev              # Vite webview only (backend commands are unavailable)
npm run typecheck        # Strict TypeScript checks
npm run lint             # ESLint
npm run test             # Vitest and React Testing Library
npm run format:check     # TypeScript, CSS, JSON, and Markdown formatting
npm run rust:fmt:check   # Rust formatting
npm run rust:clippy      # Clippy with warnings denied
npm run rust:test        # Rust unit and mock-server integration tests
npm run shortcut         # Create/update Pocket Player.lnk on this user's Desktop
npm run verify           # Every non-interactive frontend and Rust check
npm run tauri build      # Release executable plus MSI and NSIS bundles
```

Use `npm.cmd` in place of `npm` for all commands if the PowerShell script shim is blocked. The exact start command on this desktop is:

```powershell
npm.cmd run tauri dev
```

## Android build (technical preview)

Android uses the same frontend and Rust core. Audio goes through the native Media3 service in `src-tauri/plugins/pocket-playback` ([ADR-011](docs/decisions/ADR-011-android-native-playback-and-android-auto.md)). Prerequisites:

- A JDK 17 or 21 for Gradle 8.14. Android Studio's bundled JBR is now JDK 25, which this Gradle cannot run; Android Studio can download a JBR 21 to `%USERPROFILE%\.jdks`.
- The Android SDK with platform 36, and NDK 30.
- The Rust `aarch64-linux-android` target (`tauri android init` installs all four Android targets).

In PowerShell, set the toolchain variables for the session:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jbr-21.0.11"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\30.0.15729638"
```

Generate the Gradle project once. `src-tauri/gen/` is gitignored; all Android-specific code and manifest entries live in the plugin, so regenerating is safe:

```powershell
npx tauri android init --ci
```

Build a debug APK for 64-bit ARM phones:

```powershell
npx tauri android build --debug --target aarch64 --apk
```

Device checks to perform before calling an Android build validated:

1. Playback continues with the screen off and the app in the background; the media notification and lock-screen controls work.
2. Bluetooth headset buttons and unplugging headphones (playback pauses) behave correctly.
3. Visualisers on Now Playing react to the music, and no spectrum traffic runs when they are off screen.
4. Android Auto, checked with the Desktop Head Unit (`$env:ANDROID_HOME\extras\google\auto\desktop-head-unit.exe`) after enabling developer mode in the Android Auto app: the browse tree, search, track selection, and transport controls all work.
5. HTTPS to the Navidrome server works on a release build. This exercises the Android certificate verifier and the cleartext rule that admits only `127.0.0.1`.

Android passwords are session-only, so Android Auto has a library only while the app process has a signed-in session.

### Testing Android Auto with the Desktop Head Unit

Use a real phone; Android 10+ phones have Android Auto built in. Emulator images ship only an Android Auto stub, which needs a Play Store sign-in to replace. Steps verified on a Pixel 10 Pro (Android 17, Android Auto 17.9) with DHU 2.0:

1. Install the DHU with the SDK manager. This SDK manager build uses slash-separated package paths: `sdkmanager --install "extras/google/auto"`.
2. If Windows shows the phone's **ADB Interface** but `adb devices` does not list it, Windows has bound a generic driver. Restart adb with its built-in USB backend: `adb kill-server`, then `$env:ADB_LIBUSB = "1"; adb start-server`.
3. A debug build signed on another machine cannot update an existing install (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Uninstall the old copy first; this deletes its on-device data.
4. On the phone: in Android Auto settings, tap **Version** ten times, then turn on **⋮ → Developer settings → Unknown sources**, so sideloaded builds appear. Then choose **⋮ → Start head unit server**.
5. On the PC, run `adb forward tcp:5277 tcp:5277`, then start `desktop-head-unit.exe` **without flags**. `--usb=false` makes it search for a USB device whose serial is "false". When scripting, keep its stdin open, because it exits on end-of-input.
6. If Android Auto crashes with `IllegalStateException: Already connected` (seen after a DHU session ends abruptly), run `adb shell am force-stop com.google.android.projection.gearhead`, then start the head unit server again on the phone.

## Desktop shortcut

Build the self-contained production application once, then create the shortcut:

```powershell
npm.cmd run tauri build
npm.cmd run shortcut
```

The shortcut launches `src-tauri\target\release\navidrome-desktop.exe` directly, without a terminal or development server. Installing the generated MSI or NSIS package is preferable for a normal release installation; rerun the shortcut command if the repository is moved.

## Local data and credentials

- Non-secret profile and player settings: `%APPDATA%\com.burtonsvilla.navidrome-desktop\settings.json` (resolved through the official Tauri Store plugin).
- Remembered password: Windows Credential Manager.
  - Service/target prefix: `com.burtonsvilla.navidrome-desktop`
  - Account: the SHA-256 `profileId` derived from normalized server URL, a newline, and username.
  - Secret: the Navidrome password only.
- Build output: `src-tauri\target` and `dist`; both are ignored by Git.
- Metadata cache and desktop-only playback history: `%APPDATA%\com.burtonsvilla.navidrome-desktop\library.sqlite3`.
- Redacted diagnostics: the `diagnostics` folder beneath the same application-data directory.

The settings file must never contain a password, Subsonic token/salt, authenticated upstream URL, API key, or loopback session token.

## Licensing and distribution

Pocket Player's original code is licensed under the root [MIT License](LICENSE). Third-party components retain their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Before distributing any binary, generate and review a target-specific dependency notice bundle from `package-lock.json` and `src-tauri/Cargo.lock`, include all required third-party texts and attributions, and archive the report with the release revision. The configured Tauri bundles include the Pocket Player licence metadata, but that does not replace the third-party review.

## Library index and migrations

The Rust backend downloads the searchable track catalogue in bounded 500-track pages, stores it transactionally in SQLite, and builds a compact in-memory search string over useful text tags. Track queries sort and filter the full result set before returning a page to React. Refresh the index from Tracks after a Navidrome scan or bulk retag.

SQLite schema changes are applied through the `schema_migrations` table. Add a forward-only migration, preserve existing profile-scoped rows, and add a migration regression test before changing a released schema.

## Manual release checklist

Automated tests use local mock HTTP servers and do not require a real account. Exercise this checklist manually with credentials entered only into the running app:

1. Run `npm.cmd run verify`, complete the third-party licence review, then run `npm.cmd run tauri build` locally on Windows.
2. Run `npm.cmd run tauri dev` and connect with credentials entered only in the app.
3. Confirm Home sections, full search, albums, artists, tracks, genres, favourites, and playlists show real data.
4. Open an album and start a middle track. Navigate throughout the app and confirm the persistent player continues.
5. In Tracks, refresh the index; search a genre/mood/tag and verify numeric ascending/descending Length sorts using tracks above and below ten minutes.
6. Create a temporary playlist, add/reorder/remove tracks, refresh, and confirm Navidrome reflects it; then delete the temporary playlist.
7. Star and rate a test item, refresh, verify it persists, then restore its original state.
8. Exercise play next, add, duplicate, reorder, remove, jump, shuffle, repeat-one, repeat-queue, restart restore, and automatic advance.
9. Open/close the mini player, use the tray and media keys, and verify playback never duplicates or restarts.
10. In WebView2 developer tools, confirm media/art requests use only `http://127.0.0.1:<random-port>/<process-token>/...`, never authenticated Navidrome URLs.
11. Cross the scrobble threshold and confirm one completed play. Seek near the end of another track without listening and confirm it does not count.
12. Verify synchronized/plain lyrics and all visualisers when representative tracks are available.
13. Restart and confirm remembered login, queue, current item, and approximate position restore without plaintext secrets in app files.
14. Export diagnostics and inspect the JSON for redaction; clear local data and confirm Navidrome content is untouched.
15. Test invalid credentials, server-offline behavior, private-LAN HTTP warning, and logout/credential deletion.

Code signing, update publication, and real-server mutations cannot be truthfully validated by automated tests. Record those results in release notes after the release owner provides the certificate, updater key, endpoint, and disposable test data.

Do not record credentials or private server addresses in screenshots, fixtures, logs, or bug reports.

## Troubleshooting

### `rustc`, `cargo`, or `rustup` is not found

Install Rustup, close the terminal, and open a new one so `%USERPROFILE%\.cargo\bin` is added to `PATH`. Confirm with `rustc --version` and `cargo --version`.

### MSVC linker or Windows SDK is missing

Open Visual Studio Installer, modify Build Tools, and add **Desktop development with C++**, an MSVC x64/x86 toolset, and a current Windows SDK. Restart the terminal afterward.

### WebView2 is missing

Install or repair the Microsoft Edge WebView2 Evergreen Runtime from Microsoft, then restart Windows. Do not replace it with a browser-hosted or Docker workflow.

### PowerShell says `npm.ps1` cannot be loaded

Run `npm.cmd ...` or use Command Prompt. This does not require lowering PowerShell execution policy.

### Cargo reports OS error 4551 or Code Integrity event 3077

This machine may enforce an enterprise policy that requires generated executables to be signed. Cargo build scripts and Rust test binaries are compiler-generated and will be blocked in both `target` and `%TEMP%` under such a policy. Ask the Windows administrator to provide a narrowly scoped developer-tool policy exception for local Rust compiler output. Do not disable Code Integrity or application-control security globally.

### The app cannot connect

- Verify the canonical Navidrome base URL and any intentional base path.
- Confirm `/rest` reaches Navidrome through the existing reverse proxy.
- Use a valid HTTPS certificate; the app intentionally has no ignore-certificate switch.
- If Navidrome redirects to another host, enter the canonical destination directly.
- Use Settings → **Test connection** after a session is established.
