import Phaser from "phaser";
import { FLANK, FOLLOWER, FOLLOWER_STATS, FollowerKind, GROUND_LINE, HORDE_SPREAD } from "../config/tuning";
import { CHARACTER_TEXTURE, applyCharacterArt } from "./characterArt";
import { CharacterLayerStack } from "./characterLayers";
import { Soldier } from "./Soldier";

export type FollowerMode = "FOLLOW" | "RUSH";

export class Follower extends Phaser.Physics.Arcade.Sprite {
  rank: number;
  /** Extra images drawn over this follower (see characterLayers.ts). Empty
   * for today's single-layer art. */
  readonly layers!: CharacterLayerStack;
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

  /** Which soldier this follower's flank side was chosen against, and the
   * side itself: -1 left of it, +1 right, 0 "not flanking, walk at its
   * centre". Latched — once a side is taken it is held for as long as the
   * target is the same object, which is what stops two followers at
   * near-equal distance swapping sides every frame. Cleared when the target
   * changes or is lost. See FLANK in tuning. */
  flankTarget: Soldier | null = null;
  flankSide: -1 | 0 | 1 = 0;

  /** This follower's nudge on its flank standoff, so two on the same side
   * don't stand in the same spot. Resolved once from the spawn seed. */
  readonly flankJitter: number;

  /** This follower's spot in the depth band — how many world px nearer (+) or
   * further (-) down the street it stands than the canonical ground line.
   * Fixed at construction and never re-rolled, so a follower never pops
   * vertically when one ahead of it dies or fuses. */
  readonly depthOffset: number;

  /** This follower's resting draw depth: its band offset plus a per-seed
   * epsilon that breaks ties deterministically between two followers sharing
   * an offset. Constant for life — the front-slot lift overrides the depth
   * that is drawn, never this. */
  readonly bandDepth: number;

  /** The tie-break epsilon on its own, so the lifted lane can carry the same
   * one and stay collision-free (see FLANK_FRONT_DEPTH). */
  readonly seedEpsilon: number;

  /** True while this follower holds one of its side's front slots and so
   * draws in front of the soldier it is biting. Owned by
   * GameScene.updateFlankDepths, which rewrites it for every follower every
   * frame; cleared with the side itself in releaseFlankIfNot so a follower
   * that loses its target can't stay lifted. */
  frontSlot = false;

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
    // After applyCharacterArt so the first sync copies the seated origin —
    // which for a follower is solved against its own band line, not the
    // global one, and the overlays have to inherit exactly that.
    this.layers = new CharacterLayerStack(scene, this, kind);
    this.depthOffset = depthOffset;
    this.xJitter = xOffsets[wrap(seed, xOffsets.length)];
    this.flankJitter = FLANK.sideJitter[wrap(seed, FLANK.sideJitter.length)];
    // Feet line is the sort key, so a follower standing further down the
    // street draws in front of one standing further back. Soldiers (and
    // Emily, higher still) are exempt and draw in front of the whole band —
    // except that a follower which has latched a flank side and arrived in
    // bite range is lifted in front of the soldier it is biting, bounded per
    // side (FLANK_FRONT_DEPTH, docs/RENDERING.md section 2). That lift is a
    // per-frame override applied by GameScene; this value is the follower's
    // resting band depth and never changes for its life.
    // The seed breaks ties between two followers sharing an offset,
    // deterministically, and is carried into the lifted depth too so the
    // "no two followers share a depth" invariant holds in both lanes.
    this.setDepth(depthOffset + seed * 1e-4);
    this.seedEpsilon = seed * 1e-4;
    this.bandDepth = depthOffset + this.seedEpsilon;
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

  /** Drop the latched flank side if this follower is no longer attacking the
   * soldier it chose that side against — a new fight is a new decision.
   * Called once a frame by GameScene before anyone moves. */
  releaseFlankIfNot(target: Soldier | null): void {
    if (this.flankTarget === target) return;
    this.flankTarget = target;
    this.flankSide = 0;
    this.frontSlot = false;
  }

  /** Point at something regardless of which way this follower is travelling.   * followTarget flips by direction of travel, which is wrong the moment a
   * follower crosses to a soldier's far side: it arrives past its target and
   * would stand there facing away from the thing it's biting. Two clusters
   * facing inward is most of what makes a surround read as one. */
  faceToward(targetX: number): void {
    this.setFlipX(targetX < this.x);
  }

  /** Beelines at boosted speed during an aggro burst; no steering/re-acquire. */
  rushToward(targetX: number): void {
    const dx = targetX - this.x;
    this.setFlipX(dx < 0);
    // stats.deadzone, not a hardcoded stop: a rusher aiming at a flank slot
    // already stands flankStandoff off the soldier's centre, and a stop
    // distance bigger than the deadzone would park it outside its own bite
    // range for the whole burst.
    if (Math.abs(dx) < this.stats.deadzone) {
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

  /** Overlay sprites are separate scene objects, so they need tearing down
   * with their follower — otherwise they'd be left floating where one died
   * or fused. */
  destroy(fromScene?: boolean): void {
    this.layers?.destroy();
    super.destroy(fromScene);
  }
}
