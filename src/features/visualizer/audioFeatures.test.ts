import { describe, expect, it } from 'vitest';

import { AudioFeatureTracker, averageBand } from './audioFeatures';
import {
  nextVisualizerMode,
  presetFor,
  VISUALIZER_MODES,
  VISUALIZER_PRESETS,
} from './visualizerPresets';

describe('visualizer audio interpretation', () => {
  it('measures independent frequency regions', () => {
    const spectrum = new Uint8Array(100);
    spectrum.fill(255, 0, 6);
    expect(averageBand(spectrum, 0, 0.06)).toBe(1);
    expect(averageBand(spectrum, 0.34, 0.78)).toBe(0);
  });

  it('detects a transient without reporting every following frame as a new beat', () => {
    const tracker = new AudioFeatureTracker();
    tracker.update(new Uint8Array(128), 0, 1);
    const impact = new Uint8Array(128);
    impact.fill(245, 0, 20);
    expect(tracker.update(impact, 200, 1).beat).toBe(1);
    expect(tracker.update(impact, 216, 1).beat).toBeLessThan(1);
  });

  it('reuses its feature result to avoid a per-frame allocation', () => {
    const tracker = new AudioFeatureTracker();
    const first = tracker.update(new Uint8Array(32), 0, 1);
    const second = tracker.update(new Uint8Array(32), 16, 1);
    expect(second).toBe(first);
  });

  it('rotates sequentially or deterministically in random mode', () => {
    const modes = ['bars', 'sparks', 'plasma'] as const;
    expect(nextVisualizerMode('bars', [...modes], false)).toBe('sparks');
    expect(nextVisualizerMode('bars', [...modes], true, () => 0.99)).toBe('plasma');
  });

  it('has one trusted preset definition for every persisted mode', () => {
    expect(new Set(VISUALIZER_PRESETS.map((preset) => preset.id)).size).toBe(
      VISUALIZER_MODES.length,
    );
    expect(VISUALIZER_PRESETS.every((preset) => preset.description.length > 20)).toBe(true);
  });

  it('registers Sol5.6 as a trusted local adaptive scene', () => {
    expect(presetFor('sol56')).toEqual({
      id: 'sol56',
      name: 'Sol5.6',
      description: 'Spectral tokens flow through attention, memory and a luminous inference core.',
      category: 'Adaptive',
      renderer: 'canvas2d',
    });
  });
});
