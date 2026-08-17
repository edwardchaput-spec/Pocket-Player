export type SubmitReport = (submission: boolean) => Promise<unknown>;
export type AcceptedReport = (submission: boolean, listenedSeconds: number) => void;

export function completionThreshold(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 30) return Number.POSITIVE_INFINITY;
  return Math.min(durationSeconds * 0.5, 240);
}

export class ScrobbleController {
  private playingSince: number | null = null;
  private listenedSeconds = 0;
  private nowPlayingSent = false;
  private completed = false;
  private completedInFlight = false;
  private completionFailures = 0;

  constructor(
    private readonly submit: SubmitReport,
    private readonly accepted: AcceptedReport = () => undefined,
  ) {}

  playing(nowMilliseconds: number): void {
    if (this.playingSince == null) this.playingSince = nowMilliseconds;
    if (!this.nowPlayingSent) {
      this.nowPlayingSent = true;
      void this.submit(false).then(
        () => this.accepted(false, this.listenedSeconds),
        () => undefined,
      );
    }
  }

  stopped(nowMilliseconds: number): void {
    this.accumulate(nowMilliseconds);
    this.playingSince = null;
  }

  sample(nowMilliseconds: number, durationSeconds: number): void {
    this.accumulate(nowMilliseconds);
    if (
      !this.completed &&
      !this.completedInFlight &&
      this.completionFailures < 3 &&
      this.listenedSeconds >= completionThreshold(durationSeconds)
    ) {
      this.completedInFlight = true;
      void this.submit(true).then(
        () => {
          this.completed = true;
          this.completedInFlight = false;
          this.accepted(true, this.listenedSeconds);
        },
        () => {
          this.completionFailures += 1;
          this.completedInFlight = false;
        },
      );
    }
  }

  listened(): number {
    return this.listenedSeconds;
  }

  isCompleted(): boolean {
    return this.completed;
  }

  isCompletedOrPending(): boolean {
    return this.completed || this.completedInFlight;
  }

  private accumulate(nowMilliseconds: number): void {
    if (this.playingSince == null) return;
    const elapsed = Math.max(0, nowMilliseconds - this.playingSince) / 1000;
    this.listenedSeconds += elapsed;
    this.playingSince = nowMilliseconds;
  }
}
