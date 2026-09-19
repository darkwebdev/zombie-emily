import Phaser from "phaser";
import { FOLLOWER, FOLLOWER_STATS, FollowerKind, GROUND_LINE, HORDE_SPREAD } from "../config/tuning";
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

  /** This follower's spot in the depth band — how many world px nearer (+) or
   * further (-) down the street it stands than the canonical ground line.
   * Fixed at construction and never re-rolled, so a follower never pops
   * vertically when one ahead of it dies or fuses. */
  readonly depthOffset: number;

  /** A constant nudge on this follower's *trail* target only, so a stopped
   * line doesn't collapse onto one x. Deliberately not applied while rushing
   * or engaging — see GameScene's follower loop. */
  readonly xJitter: number;

  /** `y` is the *canonical* ground Y (WORLD.groundY) — the constructor adds
   * this kind's spawnYOffset and this follower's own depth offset on top, so
   * no caller has to know about either. `seed` comes from the scene's own
   * per-run spawn counter (see GameScene.nextFollowerSeed). */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    rank: number,
    kind: FollowerKind = "BASE",
    seed = 0,
  ) {
    const stats = FOLLOWER_STATS[kind];
    const { offsets, xOffsets } = HORDE_SPREAD;
    const wrap = (n: number, len: number) => ((n % len) + len) % len;
    const depthOffset = offsets[wrap(seed, offsets.length)];
    super(scene, x, y + stats.spawnYOffset + depthOffset, CHARACTER_TEXTURE[kind]);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    // The art has to be seated against this follower's own ground line, or
    // originY would cancel the offset out and it would render in exactly the
    // same place it did before.
    applyCharacterArt(this, kind, GROUND_LINE + depthOffset);
    this.depthOffset = depthOffset;
    this.xJitter = xOffsets[wrap(seed, xOffsets.length)];
    // Feet line is the sort key, so a follower standing further down the
    // street draws behind one standing nearer — and behind Emily and the
    // soldiers, whose feet are on the canonical line (depth 0). The seed
    // breaks ties between two followers sharing an offset, deterministically.
    this.setDepth(depthOffset + seed * 1e-4);
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
