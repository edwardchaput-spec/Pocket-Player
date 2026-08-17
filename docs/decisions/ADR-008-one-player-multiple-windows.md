# ADR-008: One player with event-driven desktop windows

## Status

Accepted.

## Decision

The main window owns the only HTML audio element and Web Audio graph. The mini player receives sanitized state and sends narrow playback-control messages over Tauri events. Tray commands use the same event path.

## Consequences

- Opening or closing the mini player cannot create a second stream or duplicate scrobbles.
- The mini window can be recreated without transferring audio ownership.
- Events must never contain credentials, authenticated server URLs, or the local proxy token beyond the cover URL already safe for the current process.
