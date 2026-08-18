# ADR-009: Trusted hybrid visualizer engine

## Status

Accepted.

## Decision

Pocket Player renders its advanced visualizers with built-in Canvas 2D scenes and small first-party WebGL 2 shaders. Every scene consumes frequency and waveform frames from the one shared `AnalyserNode`. Presets are metadata in a fixed registry; the app does not download or execute preset JavaScript.

The local **AI Conductor** is an adaptive procedural director, not a remote generative-AI service. It derives bass, mid, treble, RMS energy, spectral centroid, positive spectral flux, and beat envelopes from analyser frames, then blends spatial, kinetic, and fluid shader treatments. No audio samples or metadata leave the process.

## Consequences

- GPU scenes and particle scenes share one audio graph and cannot create duplicate playback or scrobbles.
- The visualizer stage alone enters the browser Fullscreen API; Escape exits, while F and arrow keys provide keyboard controls.
- Quality, sensitivity, favourites, random mode, and rotation timing remain client-owned persisted settings.
- Canvas modes remain available when WebGL 2 is unavailable. Reduced-motion mode lowers the Canvas update rate and particle load.
- A local frame-budget governor targets 60 FPS, falls back through 45 and 30 FPS with lower internal resolution and scene complexity, then recovers gradually after sustained healthy frames.
- Rendering sleeps while playback is paused, the window is hidden, or the visualizer is outside the viewport. Quality tiers cap internal rendering at approximately 720p, 1440p, and 4K to prevent excessive fullscreen allocations.
- WebGL requests the high-performance adapter and reports the renderer selected by WebView2 in the preset browser. Adapter selection ultimately remains under Windows and the graphics driver.
- Butterchurn/Three.js are not runtime dependencies. This avoids a large bundle and third-party executable preset surface while still providing custom shader and MilkDrop-inspired effects.
