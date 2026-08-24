# Contributing to Pocket Player

Pocket Player welcomes focused bug fixes, tests, documentation improvements, accessibility work, and product proposals that fit its current scope. The project is an installed Tauri client for an existing Navidrome server; it is not a server deployment.

## Before starting

1. Read the [product specification](PRODUCT_SPEC.md) for goals, non-goals, and acceptance criteria.
2. Read the [architecture](ARCHITECTURE.md) before changing trust boundaries, playback ownership, persistence, or platform behaviour.
3. Check the [roadmap](ROADMAP.md) and existing [decision records](docs/decisions/README.md).
4. For a larger change, open an issue or discussion describing the user problem, evidence, intended outcome, alternatives, and explicit non-goals before implementation.

Feature proposals should explain the user need and validation approach, not only the desired solution. Do not imply research, usage, or performance results without evidence.

## Local workflow

Follow [DEVELOPMENT.md](DEVELOPMENT.md) for the complete Windows toolchain and troubleshooting guide.

```powershell
npm install
npm run tauri dev
```

Before requesting review, run:

```powershell
npm run verify
```

The gate covers formatting, linting, TypeScript, frontend tests, Rust formatting, Clippy, and Rust tests. Automated tests must not require a contributor's real Navidrome server or credentials.

## Project invariants

- Rust owns all Navidrome networking and credentials.
- The frontend uses only the typed Tauri facade under `src/lib/tauri`.
- Secrets, authenticated upstream URLs, and the loopback proxy token must not enter logs, fixtures, screenshots, browser persistence, SQLite, or source control.
- Navidrome identifiers are opaque strings.
- There is exactly one playback owner and one HTML audio element.
- TLS validation, Content Security Policy, and least-privilege Tauri capabilities stay enabled.
- Navidrome remains authoritative for shared library data; client-only history and statistics remain clearly labelled.
- Do not add Docker, VM, LXC, remote-build, or server-deployment workflows.

Add or update an architecture decision record when a change alters one of these boundaries or introduces a durable trade-off.

## Change expectations

- Keep the change tied to one clear user or maintenance outcome.
- Add tests at the layer where behaviour is owned.
- Cover loading, empty, error, and accessibility states where relevant.
- Preserve keyboard access, visible focus, reduced motion, and compact touch targets.
- Update the README, user guide, roadmap, specification, architecture, or ADR index when behaviour or status changes.
- Use mock data with synthetic IDs and metadata. Never include a private server address or real library details.
- Keep unrelated working-tree changes intact.

## Pull requests

Use the repository template and include:

- the problem and intended user outcome;
- scope and non-goals;
- notable decisions and trade-offs;
- verification performed and anything not verified;
- safe screenshots for visible changes, using synthetic data only;
- follow-up work, migration concerns, and documentation changes.

A passing source-level gate is not a production claim. Call out any manual Navidrome, device, package, signing, upgrade, or accessibility checks that remain.

## Security reports

Do not open a public issue for a suspected vulnerability or include credentials, private server URLs, authenticated requests, or personal library data. Follow [SECURITY.md](SECURITY.md).

## Licence of contributions

Pocket Player is distributed under the [MIT License](LICENSE). By submitting a contribution, you agree that your contribution may be distributed under the same terms and that you have the right to provide it.
