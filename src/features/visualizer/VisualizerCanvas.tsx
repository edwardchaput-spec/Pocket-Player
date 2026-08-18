import { useEffect, useMemo, useRef } from 'react';

import { useAudioAnalyser } from '../player/AudioAnalysisContext';
import { AudioFeatures, AudioFeatureTracker } from './audioFeatures';
import {
  AdaptiveRenderGovernor,
  calculateRenderSize,
  shouldRenderVisualizer,
} from './performanceGovernor';
import { createWebGLScene, isWebGLMode } from './webglRenderer';
import { VisualizerMode } from './visualizerPresets';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  life: number;
  size: number;
  hue: number;
  angle: number;
  radius: number;
}

interface Point {
  x: number;
  y: number;
}

interface SceneState {
  particles: Particle[];
  particlePool: Particle[];
  pointPool: Point[];
  ribbons: Point[][];
  ridges: number[][];
  random: () => number;
  lastBurst: number;
}

export interface VisualizerDiagnostics {
  backend: 'Canvas 2D' | 'WebGL 2';
  renderer: string | null;
  fpsLimit: number;
  resolutionScale: number;
  adaptiveLevel: number;
  suspended: boolean;
}

export function VisualizerCanvas({
  mode,
  quality,
  sensitivity,
  artworkUrl,
  seedKey,
  active = true,
  onDiagnostics,
  className = '',
}: {
  mode: VisualizerMode;
  quality: number;
  sensitivity: number;
  artworkUrl?: string | undefined;
  seedKey: string;
  active?: boolean | undefined;
  onDiagnostics?: ((diagnostics: VisualizerDiagnostics) => void) | undefined;
  className?: string | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const diagnosticsRef = useRef(onDiagnostics);
  const wakeRef = useRef<(() => void) | null>(null);
  const analyser = useAudioAnalyser();
  const seed = useMemo(() => hashSeed(`${seedKey}:${mode}`), [seedKey, mode]);

  useEffect(() => {
    activeRef.current = active;
    diagnosticsRef.current = onDiagnostics;
    wakeRef.current?.();
  }, [active, onDiagnostics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const frequency = new Uint8Array(analyser.frequencyBinCount);
    const waveform = new Uint8Array(analyser.fftSize);
    const tracker = new AudioFeatureTracker();
    const state = createSceneState(seed);
    const webgl = isWebGLMode(mode) ? createWebGLScene(canvas, mode, seed / 0xffffffff) : null;
    const context = webgl ? null : canvas.getContext('2d');
    if (!webgl && !context) return;
    const artwork = artworkUrl ? new Image() : null;
    if (artwork && artworkUrl) {
      artwork.crossOrigin = 'anonymous';
      artwork.src = artworkUrl;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const governor = new AdaptiveRenderGovernor(reducedMotion);
    let animation = 0;
    let previousTime = performance.now();
    let previousAnimationTime = previousTime;
    const startedAt = previousTime;
    let lastWidth = 0;
    let lastHeight = 0;
    let cssWidth = Math.max(1, canvas.getBoundingClientRect().width);
    let cssHeight = Math.max(1, canvas.getBoundingClientRect().height);
    let documentVisible = !document.hidden;
    let intersectsViewport = true;
    let lastDiagnostics = '';

    const emitDiagnostics = (suspended: boolean) => {
      const profile = governor.profile();
      const diagnostics: VisualizerDiagnostics = {
        backend: webgl ? 'WebGL 2' : 'Canvas 2D',
        renderer: webgl?.renderer ?? null,
        fpsLimit: profile.fps,
        resolutionScale: profile.resolutionScale,
        adaptiveLevel: profile.level,
        suspended,
      };
      const signature = JSON.stringify(diagnostics);
      if (signature === lastDiagnostics) return;
      lastDiagnostics = signature;
      diagnosticsRef.current?.(diagnostics);
    };

    const canRender = () =>
      shouldRenderVisualizer(activeRef.current, documentVisible, intersectsViewport);
    const stop = () => {
      if (animation) cancelAnimationFrame(animation);
      animation = 0;
      emitDiagnostics(true);
    };
    const schedule = () => {
      if (animation || !canRender()) return;
      previousAnimationTime = performance.now();
      previousTime = previousAnimationTime;
      animation = requestAnimationFrame(render);
      emitDiagnostics(false);
    };
    const updateActivity = () => {
      if (canRender()) schedule();
      else stop();
    };

    const render = (now: number) => {
      animation = 0;
      if (!canRender()) {
        stop();
        return;
      }
      animation = requestAnimationFrame(render);
      const frameInterval = Math.min(100, Math.max(1, now - previousAnimationTime));
      previousAnimationTime = now;
      if (!governor.shouldRender(now)) return;
      const renderStartedAt = performance.now();
      const profile = governor.profile();
      const size = calculateRenderSize(
        cssWidth,
        cssHeight,
        window.devicePixelRatio || 1,
        quality,
        profile.resolutionScale,
      );
      const { width, height } = size;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (width !== lastWidth || height !== lastHeight) {
        webgl?.resize(width, height);
        lastWidth = width;
        lastHeight = height;
      }
      analyser.getByteFrequencyData(frequency);
      analyser.getByteTimeDomainData(waveform);
      const features = tracker.update(frequency, now, sensitivity);
      const delta = Math.min(0.05, Math.max(0.001, (now - previousTime) / 1000));
      const elapsed = (now - startedAt) / 1000;
      previousTime = now;
      if (webgl) webgl.render(features, elapsed);
      else if (context) {
        drawCanvasScene(
          context,
          mode,
          frequency,
          waveform,
          features,
          state,
          artwork,
          width,
          height,
          elapsed,
          delta,
          Math.max(0.55, quality * profile.complexityScale),
          reducedMotion,
        );
      }
      if (governor.reportFrame(frameInterval, performance.now() - renderStartedAt, now)) {
        emitDiagnostics(false);
      }
    };

    const onVisibilityChange = () => {
      documentVisible = !document.hidden;
      updateActivity();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      cssWidth = Math.max(1, entry.contentRect.width);
      cssHeight = Math.max(1, entry.contentRect.height);
    });
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver((entries) => {
      intersectsViewport = entries[0]?.isIntersecting ?? true;
      updateActivity();
    });
    intersectionObserver.observe(canvas);
    wakeRef.current = updateActivity;
    schedule();
    return () => {
      stop();
      wakeRef.current = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      webgl?.destroy();
    };
  }, [analyser, artworkUrl, mode, quality, seed, sensitivity]);

  return (
    <canvas
      key={mode}
      ref={canvasRef}
      className={`visualizer-canvas visualizer-${mode} ${className}`}
      aria-label={`${mode} audio visualizer`}
    />
  );
}

function drawCanvasScene(
  context: CanvasRenderingContext2D,
  mode: VisualizerMode,
  frequency: Uint8Array,
  waveform: Uint8Array,
  features: AudioFeatures,
  state: SceneState,
  artwork: HTMLImageElement | null,
  width: number,
  height: number,
  time: number,
  delta: number,
  quality: number,
  reducedMotion: boolean,
) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
  if (['sparks', 'dust', 'fountain', 'orbit', 'rain', 'ribbons'].includes(mode)) {
    context.fillStyle = 'rgba(5, 6, 14, 0.18)';
    context.fillRect(0, 0, width, height);
  } else {
    drawBackdrop(context, width, height, features, time);
  }
  switch (mode) {
    case 'bars':
      drawBars(context, frequency, width, height, false, features);
      break;
    case 'mirror':
      drawBars(context, frequency, width, height, true, features);
      break;
    case 'wave':
      drawWave(context, waveform, width, height, time, features);
      break;
    case 'circular':
      drawCircular(context, frequency, width, height, time, features);
      break;
    case 'ambient':
      drawAmbient(context, width, height, time, features);
      break;
    case 'starfield':
      drawStarfield(context, state, width, height, features, delta, quality, reducedMotion);
      break;
    case 'sparks':
      drawSparks(context, state, width, height, features, time, delta, quality);
      break;
    case 'dust':
      drawDust(context, state, width, height, features, time, delta, quality, reducedMotion);
      break;
    case 'fountain':
      drawFountain(context, state, width, height, features, delta, quality);
      break;
    case 'orbit':
      drawOrbit(context, state, artwork, width, height, features, time, delta, quality);
      break;
    case 'rain':
      drawRain(context, state, width, height, features, delta, quality);
      break;
    case 'ribbons':
      drawRibbons(context, state, width, height, features, time, quality);
      break;
    case 'landscape':
      drawLandscape(context, state, waveform, width, height, features, quality);
      break;
    case 'geometry':
      drawGeometry(context, width, height, features, time, quality);
      break;
    case 'album3d':
      drawAlbumDimension(context, artwork, width, height, features, time);
      break;
    case 'kaleidoscope':
      drawKaleidoscope(context, waveform, width, height, features, time, quality);
      break;
    default:
      drawAmbient(context, width, height, time, features);
  }
}

function drawBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  features: AudioFeatures,
  time: number,
) {
  const gradient = context.createRadialGradient(
    width * (0.45 + Math.sin(time * 0.17) * 0.08),
    height * 0.48,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.78,
  );
  gradient.addColorStop(
    0,
    `hsla(${255 + features.centroid * 90}, 74%, ${12 + features.energy * 11}%, 1)`,
  );
  gradient.addColorStop(0.55, `hsla(${215 + features.mid * 75}, 78%, 7%, 1)`);
  gradient.addColorStop(1, '#03040a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawBars(
  context: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
  mirror: boolean,
  features: AudioFeatures,
) {
  const count = Math.max(16, Math.min(128, Math.floor(width / 7)));
  const gap = Math.max(1, width / 900);
  const barWidth = width / count - gap;
  const gradient = context.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, `hsl(${245 + features.bass * 35} 82% 53%)`);
  gradient.addColorStop(0.55, `hsl(${285 + features.mid * 45} 88% 65%)`);
  gradient.addColorStop(1, `hsl(${175 + features.treble * 80} 95% 78%)`);
  context.shadowBlur = 12 + features.energy * 28;
  context.shadowColor = '#8a64ff';
  context.fillStyle = gradient;
  for (let index = 0; index < count; index += 1) {
    const value = (data[Math.floor((index * data.length * 0.68) / count)] ?? 0) / 255;
    const barHeight = Math.max(2, Math.pow(value, 1.35) * height * (mirror ? 0.45 : 0.86));
    const x = index * (barWidth + gap);
    if (mirror) {
      roundRect(context, x, height / 2 - barHeight, barWidth, barHeight, barWidth / 2);
      roundRect(context, x, height / 2, barWidth, barHeight, barWidth / 2);
    } else roundRect(context, x, height - barHeight, barWidth, barHeight, barWidth / 2);
  }
  context.shadowBlur = 0;
}

function drawWave(
  context: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
  time: number,
  features: AudioFeatures,
) {
  context.lineCap = 'round';
  for (let layer = 4; layer >= 0; layer -= 1) {
    context.beginPath();
    const offset = Math.sin(time * 0.8 + layer) * height * 0.035;
    for (let index = 0; index < data.length; index += 3) {
      const x = (index / (data.length - 1)) * width;
      const normalized = (data[index]! - 128) / 128;
      const y = height / 2 + normalized * height * (0.24 + features.energy * 0.18) + offset;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = `hsla(${245 + layer * 22 + features.centroid * 80}, 95%, ${68 + layer * 3}%, ${0.16 + (4 - layer) * 0.17})`;
    context.lineWidth = Math.max(1, width / 900) * (1 + (4 - layer) * 0.35);
    context.shadowBlur = layer === 0 ? 24 : 8;
    context.shadowColor = context.strokeStyle;
    context.stroke();
  }
  context.shadowBlur = 0;
}

function drawCircular(
  context: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
  time: number,
  features: AudioFeatures,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const base = Math.min(width, height) * (0.16 + features.bass * 0.025);
  context.save();
  context.translate(centerX, centerY);
  context.rotate(time * 0.06);
  context.globalCompositeOperation = 'lighter';
  for (let ring = 0; ring < 3; ring += 1) {
    const count = 144;
    context.beginPath();
    for (let index = 0; index <= count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const value = (data[Math.floor(((index % count) / count) * data.length * 0.62)] ?? 0) / 255;
      const radius = base * (1 + ring * 0.42) + value * base * (0.62 - ring * 0.1);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.strokeStyle = `hsla(${250 + ring * 42 + features.centroid * 70}, 92%, 68%, ${0.82 - ring * 0.2})`;
    context.lineWidth = Math.max(1.2, width / 900) * (3 - ring);
    context.shadowBlur = 18 + features.beat * 30;
    context.shadowColor = context.strokeStyle;
    context.stroke();
  }
  context.restore();
}

function drawAmbient(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  features: AudioFeatures,
) {
  context.globalCompositeOperation = 'lighter';
  const bands = [features.bass, features.mid, features.treble];
  for (let index = 0; index < bands.length; index += 1) {
    const energy = bands[index]!;
    const x = width * (0.25 + index * 0.25 + Math.sin(time * (0.17 + index * 0.04) + index) * 0.17);
    const y = height * (0.4 + Math.cos(time * (0.13 + index * 0.05) + index * 2) * 0.22);
    const radius = Math.max(width, height) * (0.28 + energy * 0.25);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(
      0,
      `hsla(${235 + index * 62 + features.centroid * 45}, 90%, 64%, ${0.22 + energy * 0.34})`,
    );
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  context.globalCompositeOperation = 'source-over';
}

function drawStarfield(
  context: CanvasRenderingContext2D,
  state: SceneState,
  width: number,
  height: number,
  features: AudioFeatures,
  delta: number,
  quality: number,
  reduced: boolean,
) {
  const count = (reduced ? 70 : 150) * quality;
  ensureParticles(state, count, () => star(state.random));
  context.globalCompositeOperation = 'lighter';
  const speed = (0.22 + features.energy * 1.25 + features.beat * 1.7) * delta * 60;
  for (const particle of state.particles) {
    const previousZ = particle.z;
    particle.z -= speed;
    if (particle.z < 1) Object.assign(particle, star(state.random), { z: 100 });
    const scale = 80 / particle.z;
    const oldScale = 80 / previousZ;
    const x = width / 2 + particle.x * scale * width * 0.45;
    const y = height / 2 + particle.y * scale * height * 0.45;
    const oldX = width / 2 + particle.x * oldScale * width * 0.45;
    const oldY = height / 2 + particle.y * oldScale * height * 0.45;
    context.beginPath();
    context.moveTo(oldX, oldY);
    context.lineTo(x, y);
    context.strokeStyle = `hsla(${particle.hue + features.centroid * 80}, 90%, 80%, ${Math.min(1, scale * 0.45)})`;
    context.lineWidth = Math.max(0.6, scale * (1 + features.beat * 1.5));
    context.stroke();
  }
}

function drawSparks(
  context: CanvasRenderingContext2D,
  state: SceneState,
  width: number,
  height: number,
  features: AudioFeatures,
  time: number,
  delta: number,
  quality: number,
) {
  const burst = features.beat > 0.9 && time - state.lastBurst > 0.18;
  if (burst) {
    state.lastBurst = time;
    for (let index = 0; index < 42 * quality; index += 1)
      state.particles.push(spark(state.random, width, height, features, state.particlePool.pop()));
  }
  if (state.particles.length < 24 * quality)
    state.particles.push(spark(state.random, width, height, features, state.particlePool.pop()));
  trimParticlesToLatest(state, Math.floor(550 * quality));
  context.globalCompositeOperation = 'lighter';
  compactParticles(state, (particle) => {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vx *= 0.985;
    particle.vy = particle.vy * 0.985 + 80 * delta;
    particle.life -= delta * 0.75;
    context.beginPath();
    context.moveTo(particle.x, particle.y);
    context.lineTo(particle.x - particle.vx * delta * 2.5, particle.y - particle.vy * delta * 2.5);
    context.strokeStyle = `hsla(${particle.hue}, 100%, 70%, ${Math.max(0, particle.life)})`;
    context.lineWidth = particle.size;
    context.shadowBlur = 14;
    context.shadowColor = context.strokeStyle;
    context.stroke();
    return particle.life > 0;
  });
  context.shadowBlur = 0;
}

function drawDust(
  context: CanvasRenderingContext2D,
  state: SceneState,
  width: number,
  height: number,
  features: AudioFeatures,
  time: number,
  delta: number,
  quality: number,
  reduced: boolean,
) {
  ensureParticles(state, (reduced ? 80 : 190) * quality, () => dust(state.random, width, height));
  context.globalCompositeOperation = 'lighter';
  for (const particle of state.particles) {
    particle.angle += delta * (0.12 + features.mid * 0.9);
    particle.x +=
      (Math.sin(particle.angle + time * 0.18) * 12 + (features.bass - 0.3) * 20) * delta;
    particle.y += (Math.cos(particle.angle * 0.7) * 8 - features.treble * 10) * delta;
    if (particle.x < -20) particle.x = width + 20;
    if (particle.x > width + 20) particle.x = -20;
    if (particle.y < -20) particle.y = height + 20;
    if (particle.y > height + 20) particle.y = -20;
    const alpha = 0.18 + features.energy * 0.65;
    context.fillStyle = `hsla(${particle.hue + time * 4}, 88%, 74%, ${alpha})`;
    context.shadowBlur = particle.size * 5;
    context.shadowColor = context.fillStyle;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size * (0.7 + features.beat), 0, Math.PI * 2);
    context.fill();
  }
  context.shadowBlur = 0;
}

function drawFountain(
  context: CanvasRenderingContext2D,
  state: SceneState,
  width: number,
  height: number,
  features: AudioFeatures,
  delta: number,
  quality: number,
) {
  const spawnCount = Math.ceil((2 + features.energy * 8 + features.beat * 18) * quality);
  for (let index = 0; index < spawnCount; index += 1)
    state.particles.push(
      fountainParticle(state.random, width, height, features, state.particlePool.pop()),
    );
  trimParticlesToLatest(state, Math.floor(700 * quality));
  context.globalCompositeOperation = 'lighter';
  compactParticles(state, (particle) => {
    const oldX = particle.x;
    const oldY = particle.y;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vy += (170 + features.bass * 90) * delta;
    particle.life -= delta * 0.48;
    context.beginPath();
    context.moveTo(oldX, oldY);
    context.lineTo(particle.x, particle.y);
    context.strokeStyle = `hsla(${particle.hue}, 96%, 66%, ${Math.max(0, particle.life)})`;
    context.lineWidth = particle.size;
    context.shadowBlur = 10;
    context.shadowColor = context.strokeStyle;
    context.stroke();
    return particle.life > 0 && particle.y < height + 40;
  });
  context.shadowBlur = 0;
}

function drawOrbit(
  context: CanvasRenderingContext2D,
  state: SceneState,
  artwork: HTMLImageElement | null,
  width: number,
  height: number,
  features: AudioFeatures,
  time: number,
  delta: number,
  quality: number,
) {
  const count = 70 * quality;
  ensureParticles(state, count, () => orbitParticle(state.random));
  const cx = width / 2;
  const cy = height / 2;
  const artSize = Math.min(width, height) * 0.28;
  drawArtworkDisc(context, artwork, cx, cy, artSize, features, time);
  context.globalCompositeOperation = 'lighter';
  for (const particle of state.particles) {
    particle.angle += delta * particle.vx * (0.6 + features.mid * 1.6);
    const beatExpansion = features.beat * 42 * particle.z;
    const radius = Math.min(width, height) * particle.radius + beatExpansion;
    const tilt = 0.28 + particle.z * 0.55;
    const x = cx + Math.cos(particle.angle) * radius;
    const y = cy + Math.sin(particle.angle) * radius * tilt;
    context.fillStyle = `hsla(${particle.hue + features.centroid * 70}, 100%, 72%, ${0.35 + particle.z * 0.6})`;
    context.beginPath();
    context.arc(x, y, particle.size * (1 + features.treble), 0, Math.PI * 2);
    context.fill();
  }
}

function drawRain(
  context: CanvasRenderingContext2D,
  state: SceneState,
  width: number,
  height: number,
  features: AudioFeatures,
  delta: number,
  quality: number,
) {
  ensureParticles(state, 110 * quality, () => rainDrop(state.random, width, height));
  context.globalCompositeOperation = 'lighter';
  for (const particle of state.particles) {
    const oldX = particle.x;
    const oldY = particle.y;
    particle.x += (particle.vx + features.bass * 80) * delta;
    particle.y += particle.vy * (0.55 + features.energy * 1.4) * delta;
    if (particle.y > height + 50 || particle.x > width + 50)
      Object.assign(particle, rainDrop(state.random, width, height));
    context.strokeStyle = `hsla(${particle.hue}, 95%, 70%, ${0.3 + features.treble * 0.7})`;
    context.lineWidth = particle.size;
    context.beginPath();
    context.moveTo(oldX, oldY);
    context.lineTo(particle.x, particle.y);
    context.stroke();
  }
  if (features.beat > 0.72) {
    context.fillStyle = `rgba(170, 210, 255, ${features.beat * 0.08})`;
    context.fillRect(0, 0, width, height);
  }
}

function drawRibbons(
  context: CanvasRenderingContext2D,
  state: SceneState,
  width: number,
  height: number,
  features: AudioFeatures,
  time: number,
  quality: number,
) {
  if (!state.ribbons.length) state.ribbons = Array.from({ length: 5 + quality }, () => []);
  const bands = [features.bass, features.mid, features.treble, features.energy, features.centroid];
  context.globalCompositeOperation = 'lighter';
  state.ribbons.forEach((points, ribbon) => {
    const band = bands[ribbon % bands.length] ?? features.energy;
    const point = state.pointPool.pop() ?? { x: 0, y: 0 };
    point.x = width;
    point.y =
      height * (0.18 + (ribbon / (state.ribbons.length + 1)) * 0.68) +
      Math.sin(time * (0.65 + ribbon * 0.08) + ribbon) * height * (0.035 + band * 0.1);
    points.push(point);
    for (const point of points) point.x -= 2.4 + features.energy * 5;
    while (points.length > 0 && (points[0]!.x < -20 || points.length > 150)) {
      const removed = points.shift();
      if (removed) state.pointPool.push(removed);
    }
    if (points.length < 2) return;
    context.beginPath();
    points.forEach((point, index) =>
      index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
    );
    context.strokeStyle = `hsla(${230 + ribbon * 34 + features.centroid * 70}, 94%, 65%, ${0.32 + band * 0.58})`;
    context.lineWidth = (2 + band * 12) * quality * 0.65;
    context.shadowBlur = 18;
    context.shadowColor = context.strokeStyle;
    context.stroke();
  });
  context.shadowBlur = 0;
}

function drawLandscape(
  context: CanvasRenderingContext2D,
  state: SceneState,
  waveform: Uint8Array,
  width: number,
  height: number,
  features: AudioFeatures,
  quality: number,
) {
  const samples = 46 + quality * 18;
  const maximumRidges = Math.floor(18 + quality * 8);
  const ridge =
    state.ridges.length >= maximumRidges
      ? (state.ridges.pop() ?? new Array<number>(samples))
      : new Array<number>(samples);
  ridge.length = samples;
  for (let index = 0; index < samples; index += 1) {
    ridge[index] = ((waveform[Math.floor((index / samples) * waveform.length)] ?? 128) - 128) / 128;
  }
  state.ridges.unshift(ridge);
  state.ridges.length = Math.min(state.ridges.length, maximumRidges);
  context.save();
  context.translate(width / 2, height * 0.23);
  state.ridges.forEach((values, depth) => {
    const progress = depth / state.ridges.length;
    const scale = 0.25 + progress * 1.45;
    const yBase = progress * height * 0.72;
    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1) - 0.5) * width * scale;
      const y = yBase + value * height * (0.025 + progress * 0.12) * (0.6 + features.energy);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = `hsla(${205 + depth * 6 + features.centroid * 80}, 90%, ${52 + progress * 27}%, ${0.15 + progress * 0.72})`;
    context.lineWidth = 0.8 + progress * 2.2;
    context.stroke();
  });
  context.restore();
}

function drawGeometry(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  features: AudioFeatures,
  time: number,
  quality: number,
) {
  const cx = width / 2;
  const cy = height / 2;
  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = 'lighter';
  const layers = 8 + quality * 3;
  for (let layer = layers; layer >= 0; layer -= 1) {
    const sides = 3 + (layer % 6);
    const radius =
      Math.min(width, height) * (0.06 + (layer / layers) * 0.43) * (1 + features.beat * 0.08);
    context.beginPath();
    for (let side = 0; side <= sides; side += 1) {
      const angle =
        (side / sides) * Math.PI * 2 + time * (0.05 + layer * 0.004) * (layer % 2 ? 1 : -1);
      const modulation = 1 + Math.sin(angle * 3 + time + layer) * features.mid * 0.12;
      const x = Math.cos(angle) * radius * modulation;
      const y = Math.sin(angle) * radius * modulation;
      if (side === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = `hsla(${240 + layer * 17 + features.centroid * 80}, 96%, 67%, ${0.12 + ((layers - layer) / layers) * 0.55})`;
    context.lineWidth = 1 + features.bass * 3;
    context.stroke();
  }
  context.restore();
}

function drawAlbumDimension(
  context: CanvasRenderingContext2D,
  artwork: HTMLImageElement | null,
  width: number,
  height: number,
  features: AudioFeatures,
  time: number,
) {
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height) * 0.52;
  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = 'lighter';
  for (let ring = 5; ring >= 0; ring -= 1) {
    context.strokeStyle = `hsla(${235 + ring * 26 + features.centroid * 80}, 95%, 65%, ${0.08 + features.energy * 0.12})`;
    context.lineWidth = 2 + features.beat * 8;
    context.beginPath();
    context.ellipse(
      0,
      0,
      size * (0.62 + ring * 0.12),
      size * (0.2 + ring * 0.055),
      time * 0.12 + ring,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
  context.restore();
  drawArtworkDisc(context, artwork, cx, cy, size, features, time);
}

function drawArtworkDisc(
  context: CanvasRenderingContext2D,
  artwork: HTMLImageElement | null,
  cx: number,
  cy: number,
  size: number,
  features: AudioFeatures,
  time: number,
) {
  const rotation = Math.sin(time * 0.42) * 0.55;
  const perspective = Math.max(0.28, Math.cos(rotation));
  context.save();
  context.translate(cx, cy);
  context.rotate(Math.sin(time * 0.21) * 0.08);
  context.transform(perspective, Math.sin(rotation) * 0.12, 0, 1, 0, 0);
  context.shadowBlur = 38 + features.beat * 70;
  context.shadowColor = `hsl(${245 + features.centroid * 90} 95% 66%)`;
  context.fillStyle = '#151526';
  roundRect(context, -size / 2, -size / 2, size, size, size * 0.06);
  if (artwork?.complete && artwork.naturalWidth > 0) {
    context.save();
    context.beginPath();
    context.roundRect(-size / 2, -size / 2, size, size, size * 0.06);
    context.clip();
    context.drawImage(artwork, -size / 2, -size / 2, size, size);
    context.fillStyle = `rgba(120,80,255,${features.energy * 0.12})`;
    context.fillRect(-size / 2, -size / 2, size, size);
    context.restore();
  }
  context.restore();
}

function drawKaleidoscope(
  context: CanvasRenderingContext2D,
  waveform: Uint8Array,
  width: number,
  height: number,
  features: AudioFeatures,
  time: number,
  quality: number,
) {
  const segments = 8 + quality * 2;
  const radius = Math.min(width, height) * 0.46;
  context.save();
  context.translate(width / 2, height / 2);
  context.globalCompositeOperation = 'lighter';
  for (let segment = 0; segment < segments; segment += 1) {
    context.save();
    context.rotate((segment / segments) * Math.PI * 2 + time * 0.035);
    if (segment % 2) context.scale(1, -1);
    context.beginPath();
    for (let index = 0; index < waveform.length; index += 8) {
      const progress = index / waveform.length;
      const amplitude = (waveform[index]! - 128) / 128;
      const x = progress * radius;
      const y =
        amplitude * radius * (0.08 + features.energy * 0.18) +
        Math.sin(progress * 18 + time) * features.mid * 5;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = `hsla(${(segment / segments) * 220 + 190 + features.centroid * 80}, 100%, 68%, ${0.34 + features.energy * 0.52})`;
    context.lineWidth = 1.2 + features.beat * 3;
    context.stroke();
    context.restore();
  }
  context.restore();
}

function createSceneState(seed: number): SceneState {
  return {
    particles: [],
    particlePool: [],
    pointPool: [],
    ribbons: [],
    ridges: [],
    random: mulberry32(seed),
    lastBurst: -10,
  };
}

function ensureParticles(state: SceneState, count: number, create: () => Particle) {
  while (state.particles.length < count) state.particles.push(create());
  if (state.particles.length > count) state.particles.length = count;
}

function trimParticlesToLatest(state: SceneState, maximum: number) {
  const excess = state.particles.length - maximum;
  if (excess <= 0) return;
  for (let index = 0; index < excess; index += 1) {
    const particle = state.particles[index];
    if (particle && state.particlePool.length < maximum) state.particlePool.push(particle);
  }
  state.particles.copyWithin(0, excess);
  state.particles.length = maximum;
}

function compactParticles(state: SceneState, keep: (particle: Particle) => boolean) {
  let writeIndex = 0;
  for (const particle of state.particles) {
    if (keep(particle)) {
      state.particles[writeIndex] = particle;
      writeIndex += 1;
    } else if (state.particlePool.length < 1_024) {
      state.particlePool.push(particle);
    }
  }
  state.particles.length = writeIndex;
}

function particleBase(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, z: 1, life: 1, size: 1, hue: 260, angle: 0, radius: 0.3 };
}

function star(random: () => number): Particle {
  return {
    ...particleBase(),
    x: random() * 2 - 1,
    y: random() * 2 - 1,
    z: random() * 99 + 1,
    size: random() * 1.5 + 0.5,
    hue: 190 + random() * 120,
  };
}

function spark(
  random: () => number,
  width: number,
  height: number,
  features: AudioFeatures,
  particle = particleBase(),
): Particle {
  const angle = random() * Math.PI * 2;
  const speed = 90 + random() * 360 * (0.6 + features.energy);
  Object.assign(particle, particleBase(), {
    x: width / 2 + (random() - 0.5) * width * 0.08,
    y: height * (0.52 + (random() - 0.5) * 0.08),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.5 + random() * 0.7,
    size: 0.7 + random() * 2.2,
    hue: 210 + random() * 120,
  });
  return particle;
}

function dust(random: () => number, width: number, height: number): Particle {
  return {
    ...particleBase(),
    x: random() * width,
    y: random() * height,
    angle: random() * Math.PI * 2,
    size: 0.5 + random() * 2.8,
    hue: 205 + random() * 130,
  };
}

function fountainParticle(
  random: () => number,
  width: number,
  height: number,
  features: AudioFeatures,
  particle = particleBase(),
): Particle {
  Object.assign(particle, particleBase(), {
    x: width / 2 + (random() - 0.5) * width * 0.12,
    y: height + 8,
    vx: (random() - 0.5) * (130 + features.mid * 230),
    vy: -(180 + random() * 310 + features.bass * 220),
    life: 0.65 + random() * 0.9,
    size: 0.8 + random() * 2.6,
    hue: 190 + random() * 165,
  });
  return particle;
}

function orbitParticle(random: () => number): Particle {
  return {
    ...particleBase(),
    angle: random() * Math.PI * 2,
    radius: 0.18 + random() * 0.29,
    vx: (random() > 0.5 ? 1 : -1) * (0.35 + random()),
    z: random(),
    size: 0.8 + random() * 3,
    hue: 205 + random() * 140,
  };
}

function rainDrop(random: () => number, width: number, height: number): Particle {
  return {
    ...particleBase(),
    x: random() * width - width * 0.15,
    y: -random() * height,
    vx: 25 + random() * 35,
    vy: 180 + random() * 480,
    size: 0.6 + random() * 1.8,
    hue: 185 + random() * 95,
  };
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, Math.max(0, Math.min(radius, width / 2, height / 2)));
  context.fill();
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
