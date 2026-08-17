# Navidrome Desktop development

Navidrome Desktop is built and run directly on Windows. It connects to an existing Navidrome server; no Docker, VM, LXC, remote SSH host, or server-side component is used.

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
npm run verify           # Every non-interactive frontend and Rust check
npm run tauri build      # Release executable plus MSI and NSIS bundles
```

Use `npm.cmd` in place of `npm` for all commands if the PowerShell script shim is blocked. The exact start command on this desktop is:

```powershell
npm.cmd run tauri dev
```

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

## Library index and migrations

The Rust backend downloads the searchable track catalogue in bounded 500-track pages, stores it transactionally in SQLite, and builds a compact in-memory search string over useful text tags. Track queries sort and filter the full result set before returning a page to React. Refresh the index from Tracks after a Navidrome scan or bulk retag.

SQLite schema changes are applied through the `schema_migrations` table. Add a forward-only migration, preserve existing profile-scoped rows, and add a migration regression test before changing a released schema.

## Manual release checklist

Automated tests use local mock HTTP servers and do not require a real account. Exercise this checklist manually with credentials entered only into the running app:

1. Run `npm.cmd run verify`, then `npm.cmd run tauri build`, locally on Windows.
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
