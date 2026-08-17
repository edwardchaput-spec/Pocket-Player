import { describe, expect, it, vi } from 'vitest';

import { completionThreshold, ScrobbleController } from './ScrobbleController';

describe('ScrobbleController', () => {
  it('uses the earlier of half duration and 240 seconds and ignores short tracks', () => {
    expect(completionThreshold(200)).toBe(100);
    expect(completionThreshold(1000)).toBe(240);
    expect(completionThreshold(29)).toBe(Number.POSITIVE_INFINITY);
  });

  it('counts wall-clock playing time rather than a seek position', async () => {
    const submit = vi.fn<(submission: boolean) => Promise<void>>(() => Promise.resolve());
    const controller = new ScrobbleController(submit);
    controller.playing(0);
    controller.stopped(10_000);
    controller.sample(10_000, 100);
    await Promise.resolve();
    expect(controller.listened()).toBe(10);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(false);
  });

  it('submits completion exactly once per playback session', async () => {
    const submit = vi.fn<(submission: boolean) => Promise<void>>(() => Promise.resolve());
    const controller = new ScrobbleController(submit);
    controller.playing(0);
    controller.sample(60_000, 100);
    controller.sample(70_000, 100);
    await Promise.resolve();
    controller.sample(80_000, 100);
    await Promise.resolve();
    expect(submit.mock.calls.filter(([submission]) => submission)).toHaveLength(1);
  });
});
