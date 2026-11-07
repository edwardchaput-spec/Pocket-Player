import { describe, expect, it } from 'vitest';

import { AudioFeatures } from './audioFeatures';
import { ClaudeMind } from './claudeMindRenderer';
import { presetFor } from './visualizerPresets';

const QUIET: AudioFeatures = {
  bass: 0.1,
  mid: 0.1,
  treble: 0.1,
  energy: 0.2,
  centroid: 0.3,
  flux: 0.05,
  beat: 0,
};

describe('Claude mind', () => {
  it('is registered as an adaptive Canvas 2D scene', () => {
    expect(presetFor('claudeMind')).toMatchObject({
      id: 'claudeMind',
      name: 'Claude mind',
      category: 'Adaptive',
      renderer: 'canvas2d',
    });
  });

  it('fires chains of thought when the music moves and on beats', () => {
    const mind = new ClaudeMind(42);
    const { context } = canvasContextStub();
    const waveform = new Uint8Array(1024).fill(128);
    drawFrames(mind, context, () => new Uint8Array(512).fill(20), waveform, QUIET, 10);
    drawFrames(
      mind,
      context,
      () => new Uint8Array(512).fill(220),
      waveform,
      {
        ...QUIET,
        bass: 0.9,
        energy: 0.8,
        beat: 1,
      },
      1,
    );

    expect(mind.pulseCount).toBeGreaterThan(0);
  });

  it('remembers what it heard and recognises it when it comes back', () => {
    const mind = new ClaudeMind(7);
    const { context } = canvasContextStub();
    const waveform = new Uint8Array(1024).fill(128);
    const chorus = shapedSpectrum((index) => (index < 80 ? 200 : 40));
    const verse = shapedSpectrum((index) => (index > 200 ? 180 : 30));

    drawFrames(mind, context, () => chorus, waveform, QUIET, 60); // ~3s of chorus
    drawFrames(mind, context, () => verse, waveform, QUIET, 240); // ~12s of verse
    expect(mind.memoryCount).toBeGreaterThan(3);
    expect(mind.recognitions).toBe(0);

    drawFrames(mind, context, () => chorus, waveform, QUIET, 40); // the chorus returns
    expect(mind.recognitions).toBeGreaterThan(0);
  });

  it('keeps reduced motion calmer than full motion', () => {
    const full = new ClaudeMind(3);
    const calm = new ClaudeMind(3);
    const { context } = canvasContextStub();
    const waveform = new Uint8Array(1024).fill(140);
    let flip = false;
    const pulsing = () => {
      flip = !flip;
      return new Uint8Array(512).fill(flip ? 230 : 10);
    };
    let fullPeak = 0;
    let calmPeak = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      full.draw(context, pulsing(), waveform, QUIET, 960, 540, 0.05, 2, false);
      calm.draw(context, pulsing(), waveform, QUIET, 960, 540, 0.05, 2, true);
      fullPeak = Math.max(fullPeak, full.pulseCount);
      calmPeak = Math.max(calmPeak, calm.pulseCount);
    }

    expect(calmPeak).toBeLessThan(fullPeak);
  });
});

function drawFrames(
  mind: ClaudeMind,
  context: CanvasRenderingContext2D,
  frequency: () => Uint8Array,
  waveform: Uint8Array,
  features: AudioFeatures,
  frames: number,
) {
  for (let frame = 0; frame < frames; frame += 1) {
    mind.draw(context, frequency(), waveform, features, 1280, 720, 0.05, 2, false);
  }
}

function shapedSpectrum(level: (index: number) => number): Uint8Array {
  return Uint8Array.from({ length: 512 }, (_, index) => level(index));
}

function canvasContextStub() {
  const gradient = { addColorStop: () => undefined };
  const target: Record<PropertyKey, unknown> = {};
  const context = new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return () => gradient;
      }
      return () => undefined;
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context };
}
