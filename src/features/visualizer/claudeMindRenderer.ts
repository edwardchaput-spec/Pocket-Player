import { AudioFeatures } from './audioFeatures';

/**
 * Claude mind — a small, warm brain that listens.
 *
 * - Neurons sit on a golden-angle disc. Each one owns a slice of the
 *   spectrum: bass at the centre, air at the rim. A neuron fires when its
 *   own band jumps (a per-band onset), and the spark travels along curved
 *   synapses to its neighbours, sometimes setting off a chain of thought.
 * - Beats are insights: the bass core fires and a ring of light spreads out.
 * - The waveform is the inner voice: a halo that wraps the mind.
 * - Every couple of seconds the mind keeps a memory, a small glyph of the
 *   spectrum, which drifts outward over time. When the music matches an
 *   old memory (a returning chorus, say), that memory lights up and a gold
 *   thread links it back to the core.
 * - Now and then a quiet thought is captioned beneath it all.
 *
 * Everything happens locally on the analyser data already in the app.
 */

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MEMORY_BANDS = 24;
const MAX_PULSES = 260;
const MAX_MEMORIES = 30;
const MEMORY_LIFE = 48;
const RIPPLE_LIFE = 1.3;

interface Neuron {
  x: number;
  y: number;
  r: number;
  lo: number;
  hi: number;
  level: number;
  slow: number;
  peak: number;
  charge: number;
  refractory: number;
  phase: number;
  links: number[];
}

interface Pulse {
  from: number;
  to: number;
  t: number;
  speed: number;
  strength: number;
  bend: number;
}

interface Ripple {
  age: number;
  strength: number;
}

interface Memory {
  age: number;
  angle: number;
  levels: Float32Array;
  shape: Float32Array;
  hue: number;
  glow: number;
}

interface Caption {
  text: string;
  age: number;
  life: number;
}

export class ClaudeMind {
  private readonly random: () => number;
  private neurons: Neuron[] = [];
  private edges: Array<[number, number]> = [];
  private pulses: Pulse[] = [];
  private ripples: Ripple[] = [];
  private memories: Memory[] = [];
  private caption: Caption | null = null;
  private lastCaption = '';
  private captionGap = 2;
  private mood = 0.2;
  private energyFast = 0;
  private energySlow = 0;
  private fluxSlow = 0;
  private silentFor = 0;
  private loudFor = 0;
  private sinceMemory = 0;
  private sinceCompare = 0;
  private sinceRecognition = 99;
  private sinceIdleThought = 0;
  private sinceBeat = 99;
  private memoryAngle = 0;
  private previousWave: Float32Array | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private readonly bandScratch = new Float32Array(MEMORY_BANDS);
  /** Count of "I've heard this before" moments; useful for tests and curiosity. */
  recognitions = 0;

  constructor(seed: number) {
    this.random = mulberry32(seed || 0x9e3779b9);
    this.memoryAngle = this.random() * TAU;
  }

  get pulseCount(): number {
    return this.pulses.length;
  }

  get memoryCount(): number {
    return this.memories.length;
  }

  draw(
    context: CanvasRenderingContext2D,
    frequency: Uint8Array,
    waveform: Uint8Array,
    features: AudioFeatures,
    width: number,
    height: number,
    delta: number,
    quality: number,
    reducedMotion: boolean,
  ) {
    const detail = Math.max(0.55, Math.min(3, quality));
    const count = Math.round(Math.max(40, Math.min(120, 44 * detail)));
    if (this.neurons.length !== count) this.layout(count);

    const dt = Math.max(0.001, Math.min(0.05, delta)) * (reducedMotion ? 0.35 : 1);
    this.listen(frequency, features, dt, reducedMotion);
    this.think(features, dt, reducedMotion);
    this.remember(frequency, features, dt);
    this.narrate(features, dt);

    const scale = Math.min(width, height);
    const radius = scale * 0.34;
    const breath = 1 + features.bass * 0.045 + (reducedMotion ? 0 : features.beat * 0.02);
    const hue = moodHue(this.mood);

    context.save();
    this.paintBackground(context, width, height, scale, hue, features, reducedMotion);
    this.paintMemories(context, width, height, radius, scale, breath);

    context.translate(width / 2, height / 2);
    context.scale(breath, breath);
    this.paintSynapses(context, radius, scale, hue);
    context.globalCompositeOperation = 'lighter';
    this.paintRipples(context, radius, scale, hue);
    this.paintVoice(context, waveform, radius, scale, hue, features, reducedMotion);
    this.paintPulses(context, radius, scale, hue);
    this.paintNeurons(context, radius, scale, hue);
    this.paintCore(context, radius, scale, hue, features);
    context.restore();

    this.paintCaption(context, width, height, scale);
  }

  // ---------------------------------------------------------------- structure

  private layout(count: number) {
    const lo = 0.003;
    const hi = 0.78;
    const spin = this.random() * TAU;
    this.neurons = Array.from({ length: count }, (_, index) => {
      const r = Math.sqrt((index + 0.5) / count);
      const angle = index * GOLDEN_ANGLE + spin;
      return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        r,
        lo: lo * (hi / lo) ** (index / count),
        hi: lo * (hi / lo) ** ((index + 1) / count),
        level: 0,
        slow: 0,
        peak: 0.2,
        charge: 0,
        refractory: 0,
        phase: this.random() * TAU,
        links: [],
      };
    });
    const seen = new Set<string>();
    this.edges = [];
    this.neurons.forEach((neuron, index) => {
      const nearest = this.neurons
        .map((other, otherIndex) => ({
          otherIndex,
          distance: (other.x - neuron.x) ** 2 + (other.y - neuron.y) ** 2,
        }))
        .filter((candidate) => candidate.otherIndex !== index)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
      for (const { otherIndex } of nearest) {
        const key = index < otherIndex ? `${index}:${otherIndex}` : `${otherIndex}:${index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.edges.push([index, otherIndex]);
        neuron.links.push(otherIndex);
        this.neurons[otherIndex]!.links.push(index);
      }
    });
    this.pulses = [];
  }

  // ---------------------------------------------------------------- hearing

  private listen(
    frequency: Uint8Array,
    features: AudioFeatures,
    dt: number,
    reducedMotion: boolean,
  ) {
    const bins = frequency.length;
    const attack = 1 - Math.exp(-dt * 28);
    const release = 1 - Math.exp(-dt * 7);
    const slowRate = 1 - Math.exp(-dt * 2.2);
    const peakDecay = Math.exp(-dt * 0.12);
    const threshold = reducedMotion ? 0.2 : 0.11;

    this.neurons.forEach((neuron, index) => {
      const start = Math.min(bins - 1, Math.floor(neuron.lo * bins));
      const end = Math.max(start + 1, Math.min(bins, Math.ceil(neuron.hi * bins)));
      let total = 0;
      for (let bin = start; bin < end; bin += 1) total += frequency[bin] ?? 0;
      const raw = total / (end - start) / 255;
      // Automatic gain per neuron, so quiet records still light the mind.
      neuron.peak = Math.max(raw, neuron.peak * peakDecay, 0.12);
      const level = Math.min(1, raw / neuron.peak);
      neuron.level += (level - neuron.level) * (level > neuron.level ? attack : release);
      const onset = neuron.level - neuron.slow;
      neuron.slow += (neuron.level - neuron.slow) * slowRate;
      neuron.refractory -= dt;
      neuron.phase += dt * 0.7;
      neuron.charge *= Math.exp(-dt * 3.4);
      if (onset > threshold && neuron.level > 0.32 && neuron.refractory <= 0) {
        this.fire(index, Math.min(1, 0.45 + onset * 2.2), features.energy, reducedMotion);
      }
    });
  }

  private think(features: AudioFeatures, dt: number, reducedMotion: boolean) {
    this.mood += (features.centroid * 2.4 - this.mood) * (1 - Math.exp(-dt * 0.8));
    this.mood = Math.max(0, Math.min(1, this.mood));
    this.sinceBeat += dt;

    // A beat is an insight: the strongest bass neuron fires hard.
    if (features.beat >= 0.999 && this.sinceBeat > 0.16) {
      this.sinceBeat = 0;
      const coreSize = Math.max(3, Math.floor(this.neurons.length * 0.12));
      let best = 0;
      for (let index = 1; index < coreSize; index += 1) {
        if (this.neurons[index]!.level > this.neurons[best]!.level) best = index;
      }
      this.fire(best, 1, features.energy, reducedMotion);
      this.ripples.push({ age: 0, strength: 0.5 + features.bass * 0.5 });
      if (this.ripples.length > 8) this.ripples.shift();
    }

    // Idle thoughts keep the mind gently alive between notes.
    this.sinceIdleThought += dt;
    const idleEvery = 0.45 + features.energy * 2.5;
    if (this.sinceIdleThought > idleEvery) {
      this.sinceIdleThought = 0;
      const index = Math.floor(this.random() * this.neurons.length);
      this.fire(index, 0.38, features.energy, reducedMotion);
    }

    // Travelling sparks; arrivals may continue the train of thought.
    for (let index = this.pulses.length - 1; index >= 0; index -= 1) {
      const pulse = this.pulses[index]!;
      pulse.t += pulse.speed * dt;
      if (pulse.t < 1) continue;
      this.pulses[index] = this.pulses[this.pulses.length - 1]!;
      this.pulses.pop();
      const target = this.neurons[pulse.to]!;
      if (pulse.strength > 0.3 && target.refractory <= 0) {
        this.fire(pulse.to, pulse.strength, features.energy, reducedMotion, pulse.from);
      } else {
        target.charge = Math.max(target.charge, pulse.strength * 0.8);
      }
    }

    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter((ripple) => ripple.age < RIPPLE_LIFE);
  }

  private fire(
    index: number,
    strength: number,
    energy: number,
    reducedMotion: boolean,
    cameFrom = -1,
  ) {
    const neuron = this.neurons[index];
    if (!neuron) return;
    neuron.charge = Math.max(neuron.charge, strength);
    neuron.refractory = 0.24;
    const links = neuron.links.filter((link) => link !== cameFrom);
    if (!links.length) return;
    let branches = strength > 0.75 ? 2 : 1;
    if (reducedMotion) branches = this.random() < 0.4 ? 1 : 0;
    for (let branch = 0; branch < branches; branch += 1) {
      if (this.pulses.length >= MAX_PULSES) return;
      const to = links[Math.floor(this.random() * links.length)]!;
      this.pulses.push({
        from: index,
        to,
        t: 0,
        speed: 1.3 + energy * 2.2 + this.random() * 0.6,
        strength: strength * (0.74 + this.random() * 0.12),
        bend: (this.random() - 0.5) * 0.6,
      });
    }
  }

  // ---------------------------------------------------------------- memory

  private remember(frequency: Uint8Array, features: AudioFeatures, dt: number) {
    for (const memory of this.memories) {
      memory.age += dt;
      memory.glow *= Math.exp(-dt * 1.4);
    }
    this.memories = this.memories.filter((memory) => memory.age < MEMORY_LIFE);
    this.sinceMemory += dt;
    this.sinceCompare += dt;
    this.sinceRecognition += dt;
    if (features.energy < 0.04) return;

    if (this.sinceCompare > 0.4) {
      this.sinceCompare = 0;
      const now = spectralShape(frequency, this.bandScratch);
      // Only a *return* counts: if the last few seconds already sounded like
      // this, it is one long passage, not a remembered one.
      const steady = this.memories.some(
        (memory) =>
          memory.age >= 2 && memory.age < 8 && now && correlation(now, memory.shape) > 0.8,
      );
      if (now && !steady) {
        for (const memory of this.memories) {
          if (memory.age < 10) continue;
          if (correlation(now, memory.shape) > 0.94 && this.sinceRecognition > 3) {
            memory.glow = 1;
            this.sinceRecognition = 0;
            this.recognitions += 1;
            this.say('I remember this part', 4.5, true);
            break;
          }
        }
      }
    }

    if (this.sinceMemory > 1.8) {
      this.sinceMemory = 0;
      const levels = new Float32Array(MEMORY_BANDS);
      bandLevels(frequency, levels);
      const shape = new Float32Array(MEMORY_BANDS);
      if (!spectralShape(frequency, shape)) return;
      this.memoryAngle += GOLDEN_ANGLE;
      this.memories.push({
        age: 0,
        angle: this.memoryAngle,
        levels,
        shape,
        hue: moodHue(this.mood),
        glow: 0,
      });
      if (this.memories.length > MAX_MEMORIES) this.memories.shift();
    }
  }

  // ---------------------------------------------------------------- inner monologue

  private narrate(features: AudioFeatures, dt: number) {
    const fast = 1 - Math.exp(-dt * 5);
    const slow = 1 - Math.exp(-dt * 0.45);
    const before = this.energySlow;
    this.energyFast += (features.energy - this.energyFast) * fast;
    this.energySlow += (features.energy - this.energySlow) * slow;
    this.fluxSlow += (features.flux - this.fluxSlow) * slow;
    this.silentFor = features.energy < 0.03 ? this.silentFor + dt : 0;
    this.loudFor = this.energySlow > 0.5 ? this.loudFor + dt : 0;

    if (this.caption) {
      this.caption.age += dt;
      if (this.caption.age >= this.caption.life) {
        this.caption = null;
        this.captionGap = 0;
      }
    } else {
      this.captionGap += dt;
    }

    if (features.beat >= 0.999 && this.energyFast - before > 0.2) {
      this.say('here it comes', 3, true);
      return;
    }
    if (this.caption || this.captionGap < 6) return;

    let thought: string;
    if (this.silentFor > 1.5) thought = 'listening…';
    else if (this.loudFor > 8) thought = 'this is a lot of feeling';
    else if (features.bass > 0.45 && features.bass > features.mid * 1.35)
      thought = 'feeling the low end';
    else if (features.treble > 0.32 && features.treble > features.bass)
      thought = 'so much shimmer up there';
    else if (this.fluxSlow > 0.32) thought = 'so much happening at once';
    else if (this.energySlow < 0.18) thought = 'something delicate';
    else if (features.mid >= features.bass) thought = 'following the melody';
    else thought = 'finding the pattern';
    this.say(thought, 4.2, false);
  }

  private say(text: string, life: number, urgent: boolean) {
    if (!urgent && text === this.lastCaption) {
      this.captionGap = 0;
      return;
    }
    if (this.caption?.text === text) return;
    this.caption = { text, age: 0, life };
    this.lastCaption = text;
  }

  // ---------------------------------------------------------------- painting

  private paintBackground(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    hue: number,
    features: AudioFeatures,
    reducedMotion: boolean,
  ) {
    context.globalCompositeOperation = 'source-over';
    const resized = width !== this.lastWidth || height !== this.lastHeight;
    this.lastWidth = width;
    this.lastHeight = height;
    context.fillStyle = resized
      ? 'rgb(13, 10, 9)'
      : `rgba(13, 10, 9, ${reducedMotion ? 0.5 : 0.24})`;
    context.fillRect(0, 0, width, height);
    const glow = context.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      scale * 0.75,
    );
    glow.addColorStop(0, hsla(hue, 70, 45, 0.05 + features.energy * 0.08));
    glow.addColorStop(1, 'rgba(13, 10, 9, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }

  private paintMemories(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    radius: number,
    scale: number,
    breath: number,
  ) {
    if (!this.memories.length) return;
    const cx = width / 2;
    const cy = height / 2;
    const inner = radius * 1.32 * breath;
    const outer = Math.hypot(width, height) * 0.52;
    const glyph = scale * 0.024;
    context.globalCompositeOperation = 'lighter';
    context.lineCap = 'round';
    for (const memory of this.memories) {
      const life = memory.age / MEMORY_LIFE;
      const distance = inner + (outer - inner) * Math.sqrt(life);
      const angle = memory.angle + memory.age * 0.035;
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;
      const alpha = Math.min(1, memory.age * 1.5) * (1 - life) * 0.55 + memory.glow * 0.45;

      if (memory.glow > 0.04) {
        // The gold thread back to the core: recognition.
        context.strokeStyle = hsla(42, 95, 70, memory.glow * 0.5);
        context.lineWidth = Math.max(1, scale * 0.0022);
        context.beginPath();
        context.moveTo(x, y);
        context.quadraticCurveTo(
          cx + Math.cos(angle + 0.5) * distance * 0.45,
          cy + Math.sin(angle + 0.5) * distance * 0.45,
          cx,
          cy,
        );
        context.stroke();
        context.fillStyle = hsla(42, 95, 72, memory.glow * 0.25);
        context.beginPath();
        context.arc(x, y, glyph * (2 + memory.glow * 1.5), 0, TAU);
        context.fill();
      }

      context.strokeStyle = hsla(memory.glow > 0.04 ? 42 : memory.hue, 70, 72, alpha);
      context.lineWidth = Math.max(1, scale * 0.0016);
      context.beginPath();
      for (let band = 0; band < MEMORY_BANDS; band += 1) {
        const tick = (band / MEMORY_BANDS) * TAU + angle;
        const length = glyph * (0.25 + (memory.levels[band] ?? 0) * 1.25);
        context.moveTo(x + Math.cos(tick) * glyph * 0.45, y + Math.sin(tick) * glyph * 0.45);
        context.lineTo(
          x + Math.cos(tick) * (glyph * 0.45 + length),
          y + Math.sin(tick) * (glyph * 0.45 + length),
        );
      }
      context.stroke();
    }
    context.globalCompositeOperation = 'source-over';
  }

  private paintSynapses(
    context: CanvasRenderingContext2D,
    radius: number,
    scale: number,
    hue: number,
  ) {
    context.lineWidth = Math.max(1, scale * 0.0012);
    context.strokeStyle = hsla(hue, 45, 70, 0.1);
    context.beginPath();
    for (const [a, b] of this.edges) {
      const from = this.neurons[a]!;
      const to = this.neurons[b]!;
      context.moveTo(from.x * radius, from.y * radius);
      context.lineTo(to.x * radius, to.y * radius);
    }
    context.stroke();

    // Recently active connections glow a little brighter.
    context.strokeStyle = hsla(hue + 20, 80, 72, 0.22);
    context.beginPath();
    for (const [a, b] of this.edges) {
      const from = this.neurons[a]!;
      const to = this.neurons[b]!;
      if (from.charge + to.charge < 0.9) continue;
      context.moveTo(from.x * radius, from.y * radius);
      context.lineTo(to.x * radius, to.y * radius);
    }
    context.stroke();
  }

  private paintRipples(
    context: CanvasRenderingContext2D,
    radius: number,
    scale: number,
    hue: number,
  ) {
    for (const ripple of this.ripples) {
      const progress = ripple.age / RIPPLE_LIFE;
      context.strokeStyle = hsla(hue + 25, 85, 75, ripple.strength * (1 - progress) * 0.55);
      context.lineWidth = Math.max(1, scale * 0.004 * (1 - progress));
      context.beginPath();
      context.arc(0, 0, radius * (0.08 + progress * 1.3), 0, TAU);
      context.stroke();
    }
  }

  private paintVoice(
    context: CanvasRenderingContext2D,
    waveform: Uint8Array,
    radius: number,
    scale: number,
    hue: number,
    features: AudioFeatures,
    reducedMotion: boolean,
  ) {
    const points = 192;
    if (!this.previousWave || this.previousWave.length !== points) {
      this.previousWave = new Float32Array(points);
    }
    const amplitude = radius * 0.2 * (0.35 + features.energy) * (reducedMotion ? 0.5 : 1);
    const ring = radius * 1.1;
    const step = Math.max(1, Math.floor(waveform.length / points));

    // The previous frame's voice lingers as a faint echo.
    context.strokeStyle = hsla(hue - 20, 70, 60, 0.18);
    context.lineWidth = Math.max(1, scale * 0.0014);
    traceLoop(context, points, (index) => ring + this.previousWave![index]! * amplitude);

    context.strokeStyle = hsla(hue + 10, 80, 72, 0.5 + features.energy * 0.3);
    context.lineWidth = Math.max(1, scale * 0.002);
    traceLoop(context, points, (index) => {
      const sample = ((waveform[index * step] ?? 128) - 128) / 128;
      this.previousWave![index] = sample;
      return ring + sample * amplitude;
    });
  }

  private paintPulses(
    context: CanvasRenderingContext2D,
    radius: number,
    scale: number,
    hue: number,
  ) {
    const size = scale * 0.0045;
    for (const pulse of this.pulses) {
      const from = this.neurons[pulse.from]!;
      const to = this.neurons[pulse.to]!;
      const ax = from.x * radius;
      const ay = from.y * radius;
      const bx = to.x * radius;
      const by = to.y * radius;
      const mx = (ax + bx) / 2 - (by - ay) * pulse.bend;
      const my = (ay + by) / 2 + (bx - ax) * pulse.bend;
      const t = pulse.t;
      const u = 1 - t;
      const x = u * u * ax + 2 * u * t * mx + t * t * bx;
      const y = u * u * ay + 2 * u * t * my + t * t * by;
      context.fillStyle = hsla(hue + 30, 95, 70, pulse.strength * 0.35);
      context.beginPath();
      context.arc(x, y, size * 2.6, 0, TAU);
      context.fill();
      context.fillStyle = hsla(45, 100, 92, pulse.strength);
      context.beginPath();
      context.arc(x, y, size, 0, TAU);
      context.fill();
    }
  }

  private paintNeurons(
    context: CanvasRenderingContext2D,
    radius: number,
    scale: number,
    hue: number,
  ) {
    let focus: Neuron | null = null;
    for (const neuron of this.neurons) {
      const wobble = radius * 0.012;
      const x = neuron.x * radius + Math.sin(neuron.phase) * wobble;
      const y = neuron.y * radius + Math.cos(neuron.phase * 0.8) * wobble;
      const activity = Math.max(neuron.level * 0.8, neuron.charge);
      const tone = hue + neuron.r * 55 - 18;
      const size = scale * (0.0035 + neuron.level * 0.007 + neuron.charge * 0.009);
      context.fillStyle = hsla(tone, 85, 62, 0.06 + activity * 0.16);
      context.beginPath();
      context.arc(x, y, size * 3.4, 0, TAU);
      context.fill();
      context.fillStyle = hsla(
        tone,
        75 + neuron.charge * 20,
        58 + neuron.charge * 32,
        0.3 + activity * 0.7,
      );
      context.beginPath();
      context.arc(x, y, size, 0, TAU);
      context.fill();
      if (!focus || neuron.charge > focus.charge) focus = neuron;
    }

    // Attention: a thin line from the core to whatever caught its ear.
    if (focus && focus.charge > 0.55) {
      context.strokeStyle = hsla(hue + 40, 90, 80, (focus.charge - 0.55) * 0.6);
      context.lineWidth = Math.max(1, scale * 0.0015);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(focus.x * radius, focus.y * radius);
      context.stroke();
    }
  }

  private paintCore(
    context: CanvasRenderingContext2D,
    radius: number,
    scale: number,
    hue: number,
    features: AudioFeatures,
  ) {
    const size = radius * (0.16 + features.bass * 0.12 + features.beat * 0.05);
    const core = context.createRadialGradient(0, 0, 0, 0, 0, size);
    core.addColorStop(0, hsla(40, 90, 92, 0.55 + features.beat * 0.35));
    core.addColorStop(0.35, hsla(hue, 80, 62, 0.28 + features.energy * 0.25));
    core.addColorStop(1, hsla(hue, 80, 50, 0));
    context.fillStyle = core;
    context.beginPath();
    context.arc(0, 0, size, 0, TAU);
    context.fill();
    context.fillStyle = hsla(40, 100, 96, 0.8);
    context.beginPath();
    context.arc(0, 0, scale * 0.004 * (1 + features.beat), 0, TAU);
    context.fill();
  }

  private paintCaption(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
  ) {
    const caption = this.caption;
    if (!caption) return;
    const fadeIn = Math.min(1, caption.age / 0.7);
    const fadeOut = Math.min(1, (caption.life - caption.age) / 0.9);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.62;
    if (alpha <= 0) return;
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.font = `italic 400 ${Math.max(12, Math.round(scale * 0.028))}px Georgia, 'Times New Roman', serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = `rgba(245, 228, 210, ${alpha})`;
    context.fillText(caption.text, width / 2, height * 0.86 - (1 - fadeIn) * scale * 0.01);
    context.restore();
  }
}

// ---------------------------------------------------------------- helpers

function traceLoop(
  context: CanvasRenderingContext2D,
  points: number,
  radiusAt: (index: number) => number,
) {
  context.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const wrapped = index % points;
    const angle = (wrapped / points) * TAU - Math.PI / 2;
    const r = radiusAt(wrapped);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

/** Log-spaced band levels, 0..1. */
function bandLevels(frequency: Uint8Array, out: Float32Array) {
  const bins = frequency.length;
  const lo = 0.003;
  const hi = 0.78;
  for (let band = 0; band < out.length; band += 1) {
    const start = Math.min(bins - 1, Math.floor(lo * (hi / lo) ** (band / out.length) * bins));
    const end = Math.max(
      start + 1,
      Math.min(bins, Math.ceil(lo * (hi / lo) ** ((band + 1) / out.length) * bins)),
    );
    let total = 0;
    for (let bin = start; bin < end; bin += 1) total += frequency[bin] ?? 0;
    out[band] = total / (end - start) / 255;
  }
}

/** Mean-centred, unit-length band shape; false when the spectrum is flat. */
function spectralShape(frequency: Uint8Array, out: Float32Array): Float32Array | null {
  bandLevels(frequency, out);
  let mean = 0;
  for (const value of out) mean += value;
  mean /= out.length;
  let norm = 0;
  for (let band = 0; band < out.length; band += 1) {
    out[band] = out[band]! - mean;
    norm += out[band]! ** 2;
  }
  norm = Math.sqrt(norm);
  if (norm < 1e-3) return null;
  for (let band = 0; band < out.length; band += 1) out[band] = out[band]! / norm;
  return out;
}

function correlation(a: Float32Array, b: Float32Array): number {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index]! * (b[index] ?? 0);
  return total;
}

/** Coral when the sound is dark, then amber, rose and lavender as it brightens (never green). */
function moodHue(mood: number): number {
  const stops = [14, 36, -12, -62, -98];
  const position = Math.max(0, Math.min(0.999, mood)) * (stops.length - 1);
  const index = Math.floor(position);
  const mix = position - index;
  return stops[index]! + (stops[index + 1]! - stops[index]!) * mix;
}

function hsla(hue: number, saturation: number, lightness: number, alpha: number): string {
  const wrapped = ((hue % 360) + 360) % 360;
  return `hsla(${wrapped.toFixed(1)}, ${Math.min(100, saturation).toFixed(0)}%, ${Math.min(
    100,
    lightness,
  ).toFixed(0)}%, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
