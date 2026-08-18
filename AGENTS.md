# Pocket Player project instructions

- This is a local Windows Tauri application, not a server deployment. Do not add Docker, VM, LXC, or remote-build workflows.
- Read `PRODUCT_SPEC.md` and `ARCHITECTURE.md` before architectural changes.
- Rust owns all Navidrome networking and credentials. The frontend uses only the typed Tauri facade under `src/lib/tauri`.
- Never log or persist Navidrome secrets outside Windows Credential Manager. Keep authenticated upstream URLs out of the webview.
- Treat every Navidrome ID as an opaque string.
- There is exactly one playback owner and one HTML audio element.
- Do not disable TLS validation, Tauri CSP, or other security controls.
- Run `npm run verify` before declaring work complete.
- Do not commit automatically; leave changes visible for review.
