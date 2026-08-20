import { AudioFeatures } from './audioFeatures';

const TAU = Math.PI * 2;

/**
 * Sol5.6 treats a frame of music like a tiny local inference pass:
 * frequency bins become tokens, flux opens attention paths, five complete
 * latent rings and one 60% ring transform the signal, and the waveform leaves
 * the core as a decoded trace. Nothing here records audio or leaves the app.
 */
export function drawSol56(
  context: CanvasRenderingContext2D,
  frequency: Uint8Array,
  waveform: Uint8Array,
  features: AudioFeatures,
  width: number,
  height: number,
  time: number,
  quality: number,
  reducedMotion: boolean,
  seed: number,
) {
  const scale = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const motionTime = time * (reducedMotion ? 0.12 : 1);
  const detail = Math.max(0.55, Math.min(3, quality));

  context.save();
  drawInferenceBackdrop(context, width, height, centerX, centerY, scale, features);
  drawMemoryGrid(context, width, height, scale, features, motionTime, detail, seed);
  drawSignalRails(
    context,
    frequency,
    waveform,
    width,
    centerX,
    centerY,
    scale,
    features,
    motionTime,
  );
  drawAttentionField(
    context,
    frequency,
    waveform,
    centerX,
    centerY,
    scale,
    features,
    motionTime,
    detail,
    reducedMotion,
    seed,
  );
  drawLatentCore(
    context,
    frequency,
    waveform,
    centerX,
    centerY,
    scale,
    features,
    motionTime,
    detail,
    reducedMotion,
  );
  drawSignature(context, width, height, scale, features);
  context.restore();
}

function drawInferenceBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  scale: number,
  features: AudioFeatures,
) {
  const gradient = context.createRadialGradient(
    centerX,
    centerY,
    scale * 0.02,
    centerX,
    centerY,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(
    0,
    `hsla(${255 + features.centroid * 55}, 74%, ${9 + features.energy * 7}%, 0.94)`,
  );
  gradient.addColorStop(0.48, 'rgba(7, 8, 20, 0.96)');
  gradient.addColorStop(1, 'rgba(2, 3, 9, 0.99)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawMemoryGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  features: AudioFeatures,
  time: number,
  quality: number,
  seed: number,
) {
  const spacing = Math.max(scale * 0.045, scale / (14 + quality * 3));
  const offsetX = ((time * scale * 0.006 + seed * spacing) % spacing) - spacing;
  const offsetY = ((time * scale * 0.003 + seed * spacing * 0.7) % spacing) - spacing;
  context.lineWidth = Math.max(0.5, scale * 0.0007);
  context.strokeStyle = `hsla(${222 + features.centroid * 70}, 75%, 66%, ${0.035 + features.energy * 0.035})`;
  context.beginPath();
  for (let x = offsetX; x < width + spacing; x += spacing) {
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let y = offsetY; y < height + spacing; y += spacing) {
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();

  const scanY = ((time * 0.035 + seed) % 1) * height;
  const scan = context.createLinearGradient(0, scanY - scale * 0.025, 0, scanY + scale * 0.025);
  scan.addColorStop(0, 'rgba(92, 224, 255, 0)');
  scan.addColorStop(0.5, `rgba(116, 226, 255, ${0.025 + features.treble * 0.055})`);
  scan.addColorStop(1, 'rgba(92, 224, 255, 0)');
  context.fillStyle = scan;
  context.fillRect(0, scanY - scale * 0.025, width, scale * 0.05);
}

function drawSignalRails(
  context: CanvasRenderingContext2D,
  frequency: Uint8Array,
  waveform: Uint8Array,
  width: number,
  centerX: number,
  centerY: number,
  scale: number,
  features: AudioFeatures,
  time: number,
) {
  if (width < scale * 1.18) return;
  const railInner = scale * 0.325;
  const railOuter = Math.min(width * 0.43, scale * 0.66);
  const packetWidth = Math.max(1.5, scale * 0.007);
  const packetGap = Math.max(2, scale * 0.011);
  const laneGap = scale * 0.035;
  const packetCount = Math.max(4, Math.floor((railOuter - railInner) / packetGap));
  context.lineWidth = Math.max(0.7, scale * 0.001);

  for (let lane = -2; lane <= 2; lane += 1) {
    const y = centerY + lane * laneGap;
    const laneEnergy = spectrumAt(frequency, lane + 2, 5, 0.78);
    context.strokeStyle = `hsla(${205 + (lane + 2) * 22 + features.centroid * 48}, 84%, 68%, ${0.08 + laneEnergy * 0.19})`;
    context.beginPath();
    context.moveTo(centerX - railOuter, y);
    context.lineTo(centerX - railInner, y);
    context.moveTo(centerX + railInner, y);
    context.lineTo(centerX + railOuter, y);
    context.stroke();

    for (let packet = 0; packet < packetCount; packet += 1) {
      const rawPhase = packet + time * (1.4 + features.energy * 2.5) + lane * 0.7;
      const phase = ((rawPhase % packetCount) + packetCount) % packetCount;
      const progress = phase / packetCount;
      const inputX = centerX - railOuter + progress * (railOuter - railInner);
      const outputX = centerX + railInner + progress * (railOuter - railInner);
      const wave = Math.abs(waveformAt(waveform, progress) - 0.5) * 2;
      const alpha = 0.08 + laneEnergy * 0.38 + wave * features.flux * 0.25;
      context.fillStyle = `hsla(${188 + (lane + 2) * 31 + features.centroid * 60}, 96%, 72%, ${alpha})`;
      context.fillRect(inputX, y - packetWidth / 2, packetWidth * (1 + laneEnergy), packetWidth);
      context.fillRect(outputX, y - packetWidth / 2, packetWidth * (1 + wave), packetWidth);
    }
  }
}

function drawAttentionField(
  context: CanvasRenderingContext2D,
  frequency: Uint8Array,
  waveform: Uint8Array,
  centerX: number,
  centerY: number,
  scale: number,
  features: AudioFeatures,
  time: number,
  quality: number,
  reducedMotion: boolean,
  seed: number,
) {
  const tokenCount = Math.floor((reducedMotion ? 22 : 34) + quality * 7);
  const seedOffset = Math.floor(seed * 10_007) % tokenCount;
  const drift = time * (0.025 + features.mid * 0.035);
  const radiusX = scale * (0.34 + features.bass * 0.018);
  const radiusY = scale * (0.275 + features.energy * 0.018);
  context.globalCompositeOperation = 'lighter';

  for (let token = 0; token < tokenCount; token += 1) {
    const progress = token / tokenCount;
    const amplitude = spectrumAt(frequency, token, tokenCount, 0.8);
    const wave = waveformAt(waveform, progress) - 0.5;
    const angle = progress * TAU - Math.PI / 2 + drift;
    const radiusModulation = 1 + amplitude * 0.075 + wave * 0.055;
    const x = centerX + Math.cos(angle) * radiusX * radiusModulation;
    const y = centerY + Math.sin(angle) * radiusY * radiusModulation;

    if ((token + seedOffset) % 3 === 0) {
      const target = (token * 13 + seedOffset + 7) % tokenCount;
      const targetProgress = target / tokenCount;
      const targetAmplitude = spectrumAt(frequency, target, tokenCount, 0.8);
      const targetAngle = targetProgress * TAU - Math.PI / 2 + drift;
      const targetX = centerX + Math.cos(targetAngle) * radiusX * (1 + targetAmplitude * 0.075);
      const targetY = centerY + Math.sin(targetAngle) * radiusY * (1 + targetAmplitude * 0.075);
      const attention = Math.min(1, amplitude * 0.58 + targetAmplitude * 0.28 + features.flux);
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(
        centerX + Math.sin(angle * 3 + seed) * scale * 0.045,
        centerY + Math.cos(targetAngle * 2 - seed) * scale * 0.045,
        targetX,
        targetY,
      );
      context.strokeStyle = `hsla(${220 + progress * 115 + features.centroid * 45}, 96%, 72%, ${0.025 + attention * 0.16})`;
      context.lineWidth = Math.max(0.45, scale * (0.00055 + features.flux * 0.0012));
      context.stroke();
    }

    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);
    const normalX = Math.cos(angle);
    const normalY = Math.sin(angle);
    const tokenLength = scale * (0.004 + amplitude * 0.012);
    const tokenWidth = scale * (0.002 + features.treble * 0.0025);
    context.beginPath();
    context.moveTo(x + tangentX * tokenLength, y + tangentY * tokenLength);
    context.lineTo(x + normalX * tokenWidth, y + normalY * tokenWidth);
    context.lineTo(x - tangentX * tokenLength, y - tangentY * tokenLength);
    context.lineTo(x - normalX * tokenWidth, y - normalY * tokenWidth);
    context.closePath();
    context.fillStyle = `hsla(${190 + progress * 145 + features.centroid * 55}, 98%, ${64 + amplitude * 22}%, ${0.22 + amplitude * 0.7})`;
    context.shadowBlur = reducedMotion ? 0 : scale * (0.004 + amplitude * 0.012);
    context.shadowColor = context.fillStyle;
    context.fill();
  }
  context.shadowBlur = 0;
  context.globalCompositeOperation = 'source-over';
}

function drawLatentCore(
  context: CanvasRenderingContext2D,
  frequency: Uint8Array,
  waveform: Uint8Array,
  centerX: number,
  centerY: number,
  scale: number,
  features: AudioFeatures,
  time: number,
  quality: number,
  reducedMotion: boolean,
) {
  context.save();
  context.translate(centerX, centerY);
  context.globalCompositeOperation = 'lighter';
  const samples = Math.floor(32 + quality * 12);

  for (let layer = 0; layer < 6; layer += 1) {
    const completion = layer === 5 ? 0.6 : 1;
    const layerSamples = Math.max(12, Math.floor(samples * completion));
    const startAngle = -Math.PI / 2 + time * (layer % 2 ? -0.025 : 0.035);
    const baseRadius = scale * (0.052 + layer * 0.031) * (1 + features.beat * 0.025);
    context.beginPath();
    for (let sample = 0; sample <= layerSamples; sample += 1) {
      const progress = sample / samples;
      const angle = startAngle + progress * TAU;
      const spectrum = spectrumAt(frequency, sample + layer * 5, samples + layer * 5, 0.82);
      const wave = waveformAt(waveform, progress) - 0.5;
      const displacement =
        scale * (0.004 + layer * 0.00065) * (spectrum * 1.35 + wave * (0.8 + features.mid));
      const radius = baseRadius + displacement;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * (0.9 + features.centroid * 0.1);
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    if (completion === 1) context.closePath();
    const hue =
      layer === 5 ? 42 + features.centroid * 28 : 188 + layer * 25 + features.centroid * 52;
    context.strokeStyle = `hsla(${hue}, ${layer === 5 ? 96 : 90}%, ${layer === 5 ? 72 : 66}%, ${0.16 + (5 - layer) * 0.045 + features.energy * 0.22})`;
    context.lineWidth = Math.max(0.7, scale * (0.001 + (5 - layer) * 0.00025));
    context.shadowBlur = reducedMotion ? 0 : scale * (layer === 5 ? 0.014 : 0.006);
    context.shadowColor = context.strokeStyle;
    context.stroke();
  }

  const pulseRadius = scale * (0.23 + (1 - features.beat) * 0.075);
  context.beginPath();
  context.arc(0, 0, pulseRadius, 0, TAU);
  context.strokeStyle = `rgba(154, 222, 255, ${features.beat * (reducedMotion ? 0.12 : 0.28)})`;
  context.lineWidth = Math.max(0.6, scale * 0.0015);
  context.stroke();

  const coreRadius = scale * (0.033 + features.bass * 0.008 + features.beat * 0.005);
  const coreGradient = context.createRadialGradient(0, 0, 0, 0, 0, coreRadius * 2.4);
  coreGradient.addColorStop(0, `hsla(${46 + features.centroid * 35}, 100%, 88%, 0.95)`);
  coreGradient.addColorStop(0.24, `hsla(${184 + features.treble * 70}, 100%, 72%, 0.78)`);
  coreGradient.addColorStop(1, 'rgba(92, 59, 255, 0)');
  context.fillStyle = coreGradient;
  context.beginPath();
  context.arc(0, 0, coreRadius * 2.4, 0, TAU);
  context.fill();

  context.rotate(time * 0.09);
  context.beginPath();
  for (let corner = 0; corner <= 6; corner += 1) {
    const angle = (corner / 6) * TAU - Math.PI / 2;
    const radius = coreRadius * (corner % 2 ? 0.92 + features.mid * 0.08 : 1);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (corner === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = 'rgba(239, 247, 255, 0.92)';
  context.lineWidth = Math.max(0.9, scale * 0.0017);
  context.stroke();
  context.restore();
}

function drawSignature(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  features: AudioFeatures,
) {
  const margin = Math.max(12, scale * 0.028);
  const fontSize = Math.max(9, scale * 0.018);
  context.font = `600 ${fontSize}px "Segoe UI", sans-serif`;
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  context.fillStyle = `rgba(218, 231, 255, ${0.22 + features.energy * 0.2})`;
  context.fillText('SOL 5.6  /  LOCAL INFERENCE', width - margin, height - margin);
}

function spectrumAt(data: Uint8Array, index: number, count: number, reach: number): number {
  const safeCount = Math.max(1, count);
  const progress = (((index % safeCount) + safeCount) % safeCount) / safeCount;
  const bin = Math.min(data.length - 1, Math.floor(progress * data.length * reach));
  return (data[bin] ?? 0) / 255;
}

function waveformAt(data: Uint8Array, progress: number): number {
  const bin = Math.min(data.length - 1, Math.max(0, Math.floor(progress * data.length)));
  return (data[bin] ?? 128) / 255;
}
