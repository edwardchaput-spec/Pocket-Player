import { describe, expect, it } from 'vitest';

import {
  AdaptiveRenderGovernor,
  calculateRenderSize,
  shouldRenderVisualizer,
} from './performanceGovernor';

describe('visualizer performance governor', () => {
  it('degrades after sustained expensive frames and later recovers', () => {
    const governor = new AdaptiveRenderGovernor(false);
    expect(governor.profile().fps).toBe(60);

    let changed = false;
    for (let time = 100; time <= 1_600; time += 100) {
      if (governor.reportFrame(27, 15, time)) changed = true;
    }
    expect(changed).toBe(true);
    expect(governor.profile()).toMatchObject({ fps: 45, level: 1 });
    changed = false;
    for (let time = 1_700; time <= 3_200; time += 100) {
      if (governor.reportFrame(34, 22, time)) changed = true;
    }
    expect(changed).toBe(true);
    expect(governor.profile()).toMatchObject({ fps: 30, level: 2 });

    for (let time = 4_000; time <= 16_000; time += 100) governor.reportFrame(16.7, 3, time);
    expect(governor.profile().level).toBe(1);
  });

  it('uses a fixed low-work profile when reduced motion is requested', () => {
    const governor = new AdaptiveRenderGovernor(true);
    expect(governor.profile()).toMatchObject({ fps: 15, resolutionScale: 0.65 });
    expect(governor.reportFrame(100, 80, 20_000)).toBe(false);
  });

  it('sleeps unless playback, document visibility, and viewport visibility are active', () => {
    expect(shouldRenderVisualizer(true, true, true)).toBe(true);
    expect(shouldRenderVisualizer(false, true, true)).toBe(false);
    expect(shouldRenderVisualizer(true, false, true)).toBe(false);
    expect(shouldRenderVisualizer(true, true, false)).toBe(false);
  });

  it('caps fullscreen pixels according to the selected quality tier', () => {
    const balanced = calculateRenderSize(3_840, 2_160, 2, 2, 1);
    expect(balanced.width * balanced.height).toBeLessThanOrEqual(2_560 * 1_440);

    const high = calculateRenderSize(1_920, 1_080, 2, 3, 1);
    expect(high).toEqual({ width: 3_840, height: 2_160, pixelRatio: 2 });
  });
});
