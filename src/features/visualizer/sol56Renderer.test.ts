import { describe, expect, it } from 'vitest';

import { AudioFeatures } from './audioFeatures';
import { drawSol56 } from './sol56Renderer';

const FEATURES: AudioFeatures = {
  bass: 0.72,
  mid: 0.54,
  treble: 0.46,
  energy: 0.63,
  centroid: 0.51,
  flux: 0.38,
  beat: 0.82,
};

describe('Sol5.6 renderer', () => {
  it('renders analyser data through the Canvas 2D contract', () => {
    const { context } = canvasContextStub();
    const frequency = new Uint8Array(512).fill(148);
    const waveform = new Uint8Array(1024).fill(128);

    expect(() =>
      drawSol56(context, frequency, waveform, FEATURES, 1280, 720, 12.5, 2, false, 0.56),
    ).not.toThrow();
  });

  it('reduces token work when reduced motion is requested', () => {
    const full = canvasContextStub();
    const reduced = canvasContextStub();
    const frequency = new Uint8Array(256).fill(172);
    const waveform = new Uint8Array(512).fill(132);

    drawSol56(full.context, frequency, waveform, FEATURES, 960, 540, 4, 2, false, 0.3);
    drawSol56(reduced.context, frequency, waveform, FEATURES, 960, 540, 4, 2, true, 0.3);

    expect(reduced.metrics.fills).toBeLessThan(full.metrics.fills);
  });
});

function canvasContextStub() {
  const metrics = { fills: 0 };
  const gradient = { addColorStop: () => undefined };
  const target: Record<PropertyKey, unknown> = {};
  const context = new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return () => gradient;
      }
      if (property === 'fill') return () => (metrics.fills += 1);
      return () => undefined;
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, metrics };
}
