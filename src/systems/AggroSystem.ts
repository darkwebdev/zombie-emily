import Phaser from "phaser";
import { AGGRO } from "../config/tuning";
import { Follower } from "../entities/Follower";
import { Soldier } from "../entities/Soldier";

/** Single-charge burst: fills only while the horde is non-empty, spends
 * entirely on activation, locks each follower's rush target once at press
 * time. See docs/FIRST_BUILD.md §1. */
export class AggroSystem {
  value = 0;
  rushTimerRemaining = 0;
  rejectFlashRemaining = 0;

  get isFull(): boolean {
    return this.value >= AGGRO.max;
  }

  update(dt: number, followerCount: number): void {
    if (followerCount > 0 && this.value < AGGRO.max) {
      this.value = Math.min(AGGRO.max, this.value + dt / AGGRO.fillTime);
    }
    if (this.rushTimerRemaining > 0) this.rushTimerRemaining -= dt;
    if (this.rejectFlashRemaining > 0) this.rejectFlashRemaining -= dt;
  }

  /** Call on Space just-down. Returns true if the burst activated. */
  tryActivate(followers: Follower[], soldiers: Soldier[]): boolean {
    if (!this.isFull) {
      this.rejectFlashRemaining = AGGRO.rejectFlashDuration;
      return false;
    }
    this.value = 0;
    this.rushTimerRemaining = AGGRO.rushDuration;

    const candidates = soldiers.filter((s) => s.state !== "CONVERTING");
    for (const follower of followers) {
      if (follower.mode === "RUSH") continue;
      let nearest: Soldier | null = null;
      let nearestDist = AGGRO.rushAcquireRadius;
      for (const soldier of candidates) {
        const d = Phaser.Math.Distance.Between(follower.x, follower.y, soldier.x, soldier.y);
        if (d <= nearestDist) {
          nearestDist = d;
          nearest = soldier;
        }
      }
      if (nearest) {
        follower.mode = "RUSH";
        follower.rushTarget = nearest;
      }
    }
    return true;
  }

  /** Snaps followers back to the trail once the burst ends or their target
   * is no longer valid. Does not pick a replacement target. */
  resolveRushExits(followers: Follower[]): void {
    for (const follower of followers) {
      if (follower.mode !== "RUSH") continue;
      const target = follower.rushTarget;
      const targetGone = !target || !target.active || target.state === "CONVERTING";
      if (this.rushTimerRemaining <= 0 || targetGone) {
        follower.mode = "FOLLOW";
        follower.rushTarget = null;
      }
    }
  }
}
