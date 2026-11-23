# ADR-012: Android Keystore-backed remembered passwords

## Status

Accepted. Extends ADR-003 (Rust owns platform credential storage) and supersedes the session-only Android credential note in ADR-010.

## Context

Android kept the Navidrome password only in process memory, so every app restart, update, or process kill required signing in again. ADR-003 forbids falling back to plaintext settings to make a platform work, so persistence needed a hardware-backed store with the same boundary as Windows Credential Manager: only Rust may read or write secrets, and the webview never sees them.

## Decision

- **Key:** a non-exportable AES-256-GCM key in the Android Keystore, alias `pocket-player.credentials.v1`. It is created in StrongBox when the phone has one, otherwise in the TEE. It has no user-authentication requirement, because playback and Android Auto must keep working while the phone is locked.
- **Data:** each password is encrypted with a fresh random IV. The account ID is bound as GCM associated data, so a ciphertext cannot be swapped between accounts. Only the IV and ciphertext are written, to this app's private SharedPreferences (`pocket_player_credentials`), under a SHA-256 hash of the account ID.
- **Failure handling:** a value that no longer decrypts is deleted and reported as absent, and the user is asked to sign in again. This covers a key invalidated by the OS, an app reinstall, or data restored onto another phone. Errors are generic and never contain secret material, and nothing logs secrets.
- **Boundary:**
  - The Kotlin `SecureStorePlugin` is registered as a separate Tauri plugin, `pocket-secure-store`, with no permissions.
  - No capability grants it, so Tauri's ACL rejects any webview IPC to it.
  - Rust's `AndroidCredentialStore` (`src-tauri/src/credentials.rs`) calls it through `PluginHandle::run_mobile_plugin` on a blocking thread, behind the same `CredentialStore` trait as Windows.
  - A unit test fails if any capability ever mentions the plugin.
- **User experience:** `is_persistent()` is now true on Android, so the existing **Remember login** switch works there, and signing out deletes the saved password.

## Alternatives considered

- **Plaintext or obfuscated settings:** rejected by ADR-003.
- **Jetpack `EncryptedSharedPreferences`:** this is deprecated and adds a dependency. Its Keystore usage is equivalent to the code above.
- **Biometric-gated key:** this would block background and Android Auto reconnects while the phone is locked. It could be offered later as an opt-in setting.

## Consequences

- Opening the app restores the session without a password prompt.
- Android Auto still needs the app process to be running with a session. A cold Auto start without the app's UI does not yet restore the session (see ADR-011).
- Android Auto Backup may copy the ciphertext, but the key never leaves the original device, so a restored copy fails to decrypt, is discarded, and asks the user to sign in.
- The Kotlin store needs device testing: sign in with **Remember login**, force-stop the app, reopen it, then sign out and confirm the next launch asks for the password.
