export interface AudioFeatures {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  centroid: number;
  flux: number;
  beat: number;
}

export function averageBand(data: Uint8Array, startRatio: number, endRatio: number): number {
  const start = Math.max(0, Math.floor(data.length * startRatio));
  const end = Math.max(start + 1, Math.min(data.length, Math.floor(data.length * endRatio)));
  let total = 0;
  for (let index = start; index < end; index += 1) total += data[index] ?? 0;
  return total / Math.max(1, end - start) / 255;
}

export class AudioFeatureTracker {
  private previous: Uint8Array | null = null;
  private smoothedEnergy = 0;
  private beatFloor = 0.08;
  private lastBeat = -1_000;
  private readonly features: AudioFeatures = {
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    centroid: 0,
    flux: 0,
    beat: 0,
  };

  update(data: Uint8Array, now: number, sensitivity: number): AudioFeatures {
    const gain = Math.max(0.35, Math.min(2.5, sensitivity));
    const bass = clamp01(averageBand(data, 0, 0.06) * gain);
    const mid = clamp01(averageBand(data, 0.06, 0.34) * gain);
    const treble = clamp01(averageBand(data, 0.34, 0.78) * gain);
    let energyTotal = 0;
    let weighted = 0;
    let magnitude = 0;
    let flux = 0;
    for (let index = 0; index < data.length; index += 1) {
      const value = (data[index] ?? 0) / 255;
      energyTotal += value * value;
      weighted += index * value;
      magnitude += value;
      if (this.previous) flux += Math.max(0, (data[index] ?? 0) - (this.previous[index] ?? 0));
    }
    const rawEnergy = Math.sqrt(energyTotal / Math.max(1, data.length));
    const energy = clamp01(rawEnergy * gain);
    const normalizedFlux = clamp01((flux / Math.max(1, data.length) / 42) * gain);
    this.smoothedEnergy += (energy - this.smoothedEnergy) * 0.075;
    this.beatFloor += (Math.max(0.04, normalizedFlux) - this.beatFloor) * 0.025;
    const isBeat =
      normalizedFlux > this.beatFloor * 1.65 &&
      bass > this.smoothedEnergy * 0.82 &&
      now - this.lastBeat > 150;
    if (isBeat) this.lastBeat = now;
    if (!this.previous || this.previous.length !== data.length) {
      this.previous = new Uint8Array(data.length);
    }
    this.previous.set(data);
    Object.assign(this.features, {
      bass,
      mid,
      treble,
      energy,
      centroid: magnitude ? clamp01(weighted / magnitude / data.length) : 0,
      flux: normalizedFlux,
      beat: isBeat ? 1 : Math.max(0, 1 - (now - this.lastBeat) / 360),
    });
    return this.features;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
