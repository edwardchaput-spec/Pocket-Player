/**
 * The subset of `AnalyserNode` the visualisers read. A Web Audio analyser
 * satisfies it on Windows; {@link NativeSpectrumAnalyser} satisfies it on
 * Android, where audio is rendered by the native Media3 service.
 */
export interface AudioAnalyserSource {
  readonly frequencyBinCount: number;
  readonly fftSize: number;
  getByteFrequencyData(target: Uint8Array): void;
  getByteTimeDomainData(target: Uint8Array): void;
}

export const NATIVE_FFT_SIZE = 1024;
const DEMAND_WINDOW_MS = 2000;

/**
 * Holds the latest native spectrum frame. Reads record demand so the native
 * side only streams frames (about 30 per second) while a visualiser is on
 * screen.
 */
export class NativeSpectrumAnalyser implements AudioAnalyserSource {
  readonly fftSize = NATIVE_FFT_SIZE;
  readonly frequencyBinCount = NATIVE_FFT_SIZE / 2;
  private readonly frequency = new Uint8Array(NATIVE_FFT_SIZE / 2);
  private readonly waveform = new Uint8Array(NATIVE_FFT_SIZE).fill(128);
  private lastReadAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly now: () => number = () => performance.now()) {}

  getByteFrequencyData(target: Uint8Array): void {
    this.lastReadAt = this.now();
    copyInto(this.frequency, target);
  }

  getByteTimeDomainData(target: Uint8Array): void {
    this.lastReadAt = this.now();
    copyInto(this.waveform, target);
  }

  /** Applies a native frame (base64 bytes); wrong-sized frames are ignored. */
  applyFrame(frequencyBase64: string, waveformBase64: string): void {
    const frequency = decodeBase64(frequencyBase64);
    const waveform = decodeBase64(waveformBase64);
    if (frequency?.length === this.frequency.length) this.frequency.set(frequency);
    if (waveform?.length === this.waveform.length) this.waveform.set(waveform);
  }

  /** Silences the analyser, e.g. when playback pauses. */
  reset(): void {
    this.frequency.fill(0);
    this.waveform.fill(128);
  }

  isInDemand(): boolean {
    return this.now() - this.lastReadAt < DEMAND_WINDOW_MS;
  }
}

function copyInto(source: Uint8Array, target: Uint8Array) {
  const length = Math.min(source.length, target.length);
  target.set(source.subarray(0, length));
  if (target.length > length) target.fill(0, length);
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}
