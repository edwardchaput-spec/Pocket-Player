export interface RenderProfile {
  fps: number;
  resolutionScale: number;
  complexityScale: number;
  level: 0 | 1 | 2;
}

export interface RenderSize {
  width: number;
  height: number;
  pixelRatio: number;
}

const PROFILES: readonly RenderProfile[] = [
  { fps: 60, resolutionScale: 1, complexityScale: 1, level: 0 },
  { fps: 45, resolutionScale: 0.82, complexityScale: 0.84, level: 1 },
  { fps: 30, resolutionScale: 0.67, complexityScale: 0.65, level: 2 },
];

const REDUCED_MOTION_PROFILE: RenderProfile = {
  fps: 15,
  resolutionScale: 0.65,
  complexityScale: 0.55,
  level: 2,
};

const PIXEL_BUDGETS = [1_280 * 720, 2_560 * 1_440, 3_840 * 2_160] as const;

export function shouldRenderVisualizer(
  playbackActive: boolean,
  documentVisible: boolean,
  intersectsViewport: boolean,
): boolean {
  return playbackActive && documentVisible && intersectsViewport;
}

/**
 * Keeps visualisation work inside a stable frame budget. Degradation is quick
 * enough to protect playback; recovery is deliberately slower to avoid quality
 * oscillation when a scene sits close to the machine's limit.
 */
export class AdaptiveRenderGovernor {
  private level: 0 | 1 | 2 = 0;
  private averageFrameInterval = 16.7;
  private averageRenderCost = 0;
  private lastRenderedAt = -Infinity;
  private lastAdjustmentAt = 0;

  constructor(private readonly reducedMotion = false) {}

  profile(): RenderProfile {
    return this.reducedMotion ? REDUCED_MOTION_PROFILE : PROFILES[this.level]!;
  }

  shouldRender(now: number): boolean {
    const interval = 1_000 / this.profile().fps;
    if (now - this.lastRenderedAt < interval - 1) return false;
    this.lastRenderedAt = now;
    return true;
  }

  reportFrame(frameIntervalMs: number, renderCostMs: number, now: number): boolean {
    if (this.reducedMotion) return false;
    this.averageFrameInterval += (frameIntervalMs - this.averageFrameInterval) * 0.08;
    this.averageRenderCost += (renderCostMs - this.averageRenderCost) * 0.08;
    if (now - this.lastAdjustmentAt < 1_500) return false;

    const overloaded =
      this.averageRenderCost > (this.level === 0 ? 12 : 19) ||
      (this.level === 0 && this.averageFrameInterval > 21.5) ||
      (this.level === 1 && this.averageFrameInterval > 30);
    if (overloaded && this.level < 2) {
      this.level = (this.level + 1) as 1 | 2;
      this.lastAdjustmentAt = now;
      return true;
    }

    const recoveryDelay = this.level === 2 ? 12_000 : 18_000;
    const healthy = this.averageRenderCost < 7.5 && this.averageFrameInterval < 19;
    if (healthy && this.level > 0 && now - this.lastAdjustmentAt >= recoveryDelay) {
      this.level = (this.level - 1) as 0 | 1;
      this.lastAdjustmentAt = now;
      return true;
    }
    return false;
  }
}

export function calculateRenderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  quality: number,
  resolutionScale: number,
): RenderSize {
  const tier = Math.max(1, Math.min(3, Math.round(quality)));
  const safeWidth = Math.max(1, cssWidth);
  const safeHeight = Math.max(1, cssHeight);
  let ratio = Math.min(Math.max(1, devicePixelRatio || 1), tier) * resolutionScale;
  const requestedPixels = safeWidth * safeHeight * ratio * ratio;
  const pixelBudget = PIXEL_BUDGETS[tier - 1]!;
  if (requestedPixels > pixelBudget) ratio *= Math.sqrt(pixelBudget / requestedPixels);
  ratio = Math.max(0.5, ratio);
  return {
    width: Math.max(1, Math.floor(safeWidth * ratio)),
    height: Math.max(1, Math.floor(safeHeight * ratio)),
    pixelRatio: ratio,
  };
}
