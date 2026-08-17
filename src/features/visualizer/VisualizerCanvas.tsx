import { useEffect, useRef } from 'react';

import { PlayerSettings } from '../../lib/tauri/types';
import { useAudioAnalyser } from '../player/AudioAnalysisContext';

export function VisualizerCanvas({
  mode,
  quality,
}: {
  mode: PlayerSettings['visualizer'];
  quality: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyser = useAudioAnalyser();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const frequency = new Uint8Array(analyser.frequencyBinCount);
    const waveform = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let animation = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const render = () => {
      animation = requestAnimationFrame(render);
      frame += 1;
      if (reduced && frame % 4 !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, quality);
      const width = Math.max(1, Math.floor(rect.width * ratio));
      const height = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      if (mode === 'wave') {
        analyser.getByteTimeDomainData(waveform);
        drawWave(context, waveform, width, height);
      } else {
        analyser.getByteFrequencyData(frequency);
        if (mode === 'circular') drawCircular(context, frequency, width, height);
        else if (mode === 'ambient') drawAmbient(context, frequency, width, height);
        else drawBars(context, frequency, width, height, mode === 'mirror');
      }
    };
    render();
    return () => cancelAnimationFrame(animation);
  }, [analyser, mode, quality]);
  return (
    <canvas
      ref={canvasRef}
      className={`visualizer-canvas visualizer-${mode}`}
      aria-label={`${mode} audio visualizer`}
    />
  );
}

function drawBars(
  context: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
  mirror: boolean,
) {
  const count = Math.min(96, Math.floor(width / 6));
  const gap = 2;
  const barWidth = width / count - gap;
  const gradient = context.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, '#6d55e8');
  gradient.addColorStop(1, '#d1c8ff');
  context.fillStyle = gradient;
  for (let index = 0; index < count; index += 1) {
    const value = (data[Math.floor((index * data.length) / count)] ?? 0) / 255;
    const barHeight = Math.max(2, value * height * (mirror ? 0.46 : 0.92));
    const x = index * (barWidth + gap);
    if (mirror) {
      context.fillRect(x, height / 2 - barHeight, barWidth, barHeight);
      context.fillRect(x, height / 2, barWidth, barHeight);
    } else context.fillRect(x, height - barHeight, barWidth, barHeight);
  }
}

function drawWave(
  context: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
) {
  context.strokeStyle = '#b9aaff';
  context.lineWidth = Math.max(2, width / 700);
  context.beginPath();
  for (let index = 0; index < data.length; index += 1) {
    const x = (index / (data.length - 1)) * width;
    const y = (data[index]! / 255) * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

function drawCircular(
  context: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const base = Math.min(width, height) * 0.18;
  context.strokeStyle = '#a590ff';
  context.lineWidth = Math.max(2, width / 600);
  for (let index = 0; index < 128; index += 1) {
    const angle = (index / 128) * Math.PI * 2;
    const value = (data[index] ?? 0) / 255;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * base, centerY + Math.sin(angle) * base);
    context.lineTo(
      centerX + Math.cos(angle) * (base + value * base),
      centerY + Math.sin(angle) * (base + value * base),
    );
    context.stroke();
  }
}

function drawAmbient(
  context: CanvasRenderingContext2D,
  data: Uint8Array,
  width: number,
  height: number,
) {
  const energy = data.slice(0, 128).reduce((sum, value) => sum + value, 0) / (128 * 255);
  const gradient = context.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.65,
  );
  gradient.addColorStop(0, `rgba(165,144,255,${0.4 + energy * 0.6})`);
  gradient.addColorStop(0.45, `rgba(92,63,210,${0.25 + energy * 0.4})`);
  gradient.addColorStop(1, 'rgba(13,14,19,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}
