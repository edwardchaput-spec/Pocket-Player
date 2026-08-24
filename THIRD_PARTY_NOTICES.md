# Third-party software

Pocket Player is licensed under the [MIT License](LICENSE). That licence applies to Pocket Player's original source code and does not replace the licences of third-party packages, tools, platform runtimes, or other incorporated materials.

## Dependency records

The exact JavaScript and Rust dependency versions resolved for this source tree are recorded in:

- [package-lock.json](package-lock.json)
- [src-tauri/Cargo.lock](src-tauri/Cargo.lock)

Package and crate distributions retain their own copyright notices and licence files. The dependency metadata currently includes permissive and file-level copyleft terms, including MIT, Apache-2.0, BSD, ISC, MPL-2.0, Unicode-3.0, Zlib, CC0, and compatible dual-licence expressions. Selecting MIT for Pocket Player does not relicense any of those components.

## Binary distribution requirement

This repository does not currently publish a supported binary release. Before distributing an installer, APK/AAB, or update, the release owner must:

1. generate a target- and feature-specific dependency licence inventory from both lockfiles;
2. review packages that use a separate `license-file` or a choice of licence terms;
3. include every required third-party copyright notice, attribution, and licence text with the distributed package;
4. review licences for non-package components such as WebView2, the Android runtime/toolchain, icons, fonts, artwork, and installer assets;
5. archive the inventory with the release revision and repeat the audit whenever either lockfile changes.

This file records the repository's licensing boundary and release obligation; it is not a substitute for the complete, version-specific notice bundle required with a future binary release.
