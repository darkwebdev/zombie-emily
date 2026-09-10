import { TRAIL } from "../config/tuning";

/** Ring buffer of the leader's past X positions, sampled at a fixed interval.
 * Followers target a sample some fixed number of slots behind the newest one,
 * which produces a conga line without any pathfinding. */
export class BreadcrumbTrail {
  private samples: number[] = [];
  private msSinceLastSample = 0;

  update(dtMs: number, leaderX: number): void {
    this.msSinceLastSample += dtMs;
    if (this.msSinceLastSample >= TRAIL.sampleIntervalMs) {
      this.msSinceLastSample = 0;
      this.samples.push(leaderX);
      if (this.samples.length > TRAIL.bufferSize) {
        this.samples.shift();
      }
    }
  }

  /** offsetSamples is how many samples back from the leader to target —
   * the caller accumulates each follower's own trailSpacing (a Brute uses
   * a tighter spacing than a base follower, since it's slower and needs to
   * hug closer to still function as forward cover). */
  targetXForOffset(offsetSamples: number): number {
    if (this.samples.length === 0) {
      return NaN;
    }
    const index = Math.max(0, this.samples.length - 1 - offsetSamples);
    return this.samples[index];
  }
}
