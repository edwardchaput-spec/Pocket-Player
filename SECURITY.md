# Security policy

Pocket Player handles credentials for a self-hosted music service, so security and privacy defects are treated as product defects.

## Supported scope

There is no stable public release channel yet. Security fixes target the latest source on the default branch and any most recent build explicitly published by the repository owner. Older local builds are not maintained as supported release lines.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository if the **Report a vulnerability** action is available on the Security tab. If it is not available, contact the repository owner through their GitHub profile and ask for a private reporting channel before sending sensitive details.

Never include any of the following in an initial or public message:

- a real Navidrome password, token, salt, cookie, or API key;
- a private server hostname, IP address, or authenticated URL;
- the process-scoped loopback proxy token;
- personal library metadata, logs, database files, screenshots, or diagnostics that have not been reviewed for redaction;
- a signing certificate, private updater key, or password.

When a private channel is established, provide the affected revision/version, platform, impact, minimal reproduction with synthetic data, and any suggested mitigation. Reports are handled on a best-effort basis; this portfolio-stage project does not promise a response-time SLA.

## Security model

The intended controls include:

- Rust-owned Navidrome networking and credential access;
- Windows Credential Manager for remembered Windows passwords;
- session-only Android credentials until a reviewed Keystore strategy exists;
- fresh token-and-salt authentication without clear-text password query parameters;
- a loopback-only, process-token media proxy with narrow routes;
- same-host redirect validation and bounded network timeouts;
- least-privilege, window-specific Tauri capabilities;
- an enabled Content Security Policy and TLS validation;
- redaction of credentials, authenticated URLs, sensitive headers, usernames, and proxy tokens;
- one playback owner to prevent duplicate media sessions and scrobbles.

The detailed trust boundaries and security requirements are in [ARCHITECTURE.md](ARCHITECTURE.md) and [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

## Out of scope

The following are outside the application's protection boundary unless the app makes the situation worse:

- a fully compromised or unlocked operating-system account;
- a compromised Navidrome server or reverse proxy;
- vulnerabilities in an unsupported, modified, or outdated local build;
- an explicitly accepted private-LAN HTTP connection being observable on that network.

Even in these cases, reports are welcome when Pocket Player exposes more data than necessary, fails to enforce a documented boundary, or provides misleading security guidance.
