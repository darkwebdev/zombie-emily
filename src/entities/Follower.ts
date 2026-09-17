import Phaser from "phaser";
import { FOLLOWER, FOLLOWER_STATS, FollowerKind } from "../config/tuning";
import { CHARACTER_TEXTURE, applyCharacterArt } from "./characterArt";
import { Soldier } from "./Soldier";

export type FollowerMode = "FOLLOW" | "RUSH";

export class Follower extends Phaser.Physics.Arcade.Sprite {
  rank: number;
  readonly kind: FollowerKind;
  readonly stats: typeof FOLLOWER;
  hp: number;
  mode: FollowerMode = "FOLLOW";
  rushTarget: Soldier | null = null;
  biteCooldownRemaining = 0;
  /** False = this follower waits in place instead of chasing the trail,
   * until Emily's own position moves past where it's standing. Starts
   * false on spawn/conversion, and GameScene resets it to false again
   * every time this follower finishes an attack (autonomous engage or an
   * aggro rush) — so it stays put wherever the fight ended rather than
   * snapping straight back into line; it only rejoins once Emily walks
   * past it again. */
  hasJoined = false;

  constructor(scene: Phaser.Scene, x: number, y: number, rank: number, kind: FollowerKind = "BASE") {
    const stats = FOLLOWER_STATS[kind];
    super(scene, x, y + stats.spawnYOffset, CHARACTER_TEXTURE[kind]);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    applyCharacterArt(this, kind);
    this.rank = rank;
    this.kind = kind;
    this.stats = stats;
    this.hp = stats.hp;
  }

  get isBrute(): boolean {
    return this.kind === "BRUTE";
  }

  /** Call every frame while not yet joined. Emily "passes" a follower once
   * her x crosses to the far side of it in her current facing direction —
   * that's the moment it stops waiting and joins the trail. */
  checkJoined(emilyX: number, emilyFacing: 1 | -1): void {
    if (this.hasJoined) return;
    if (emilyFacing === 1 ? emilyX > this.x : emilyX < this.x) {
      this.hasJoined = true;
    }
  }

  /** Walks toward its assigned breadcrumb slot; NaN target (no history yet)
   * just holds position. */
  followTarget(targetX: number): void {
    if (Number.isNaN(targetX)) {
      this.setVelocityX(0);
      return;
    }
    const dx = targetX - this.x;
    this.setFlipX(dx < 0);
    if (Math.abs(dx) < this.stats.deadzone) {
      this.setVelocityX(0);
    } else {
      this.setVelocityX(Math.sign(dx) * this.stats.speed);
    }
  }

  /** Beelines at boosted speed during an aggro burst; no steering/re-acquire. */
  rushToward(targetX: number): void {
    const dx = targetX - this.x;
    this.setFlipX(dx < 0);
    if (Math.abs(dx) < 10) {
      this.setVelocityX(0);
    } else {
      this.setVelocityX(Math.sign(dx) * this.stats.speed * this.stats.rushSpeedMult);
    }
  }

  tickCooldown(dt: number): void {
    if (this.biteCooldownRemaining > 0) this.biteCooldownRemaining -= dt;
  }

  /** Returns true if this hit brought HP to 0 or below. */
  takeDamage(amount: number): boolean {
    this.hp -= amount;
    return this.hp <= 0;
  }
}
