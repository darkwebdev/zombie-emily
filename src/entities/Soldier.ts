import Phaser from "phaser";
import { ENEMY_STATS, EnemyKind, SHIELD_FLASH_DURATION, SOLDIER } from "../config/tuning";
import { CHARACTER_TEXTURE, applyCharacterArt } from "./characterArt";

// The art is already coloured per kind, so the base "tint" is white: no tint
// at all. The state tints below still multiply over it, which is the whole
// reason they survived the switch from flat rectangles to real art.
const BASE_TINT = 0xffffff;
const PARALYZED_TINT = 0x2bff5e;
const RECOVERING_TINT = 0xffb433;
const CONVERTING_TINT = 0x1fae46;
const BLOCK_FLASH_TINT = 0xffffff;
// The Rifleman's windup tell. It used to be a small rectangle standing in for
// the gun barrel, drawn beside a flat rectangle body; the art draws an actual
// rifle, so a second floating barrel beside it read as debris. Tinting the
// whole figure is both unmissable and impossible to misplace, and it's free:
// ACTIVE is the one state with no tint of its own.
const AIM_TINT = 0xff3b30;

export type SoldierState = "ACTIVE" | "PARALYZED" | "RECOVERING" | "CONVERTING";

export class Soldier extends Phaser.Physics.Arcade.Sprite {
  state: SoldierState = "ACTIVE";
  readonly kind: EnemyKind;
  readonly stats: typeof SOLDIER;
  hp: number;
  facing: 1 | -1;
  contactCooldownRemaining = 0;

  // Targeting scratch, written each frame by GameScene.updateSoldierTargeting.
  targetX: number | null = null;
  targetDist = Infinity;

  // Ranged weapon state — inert unless stats.fireRange > 0. See tickWeapon().
  aimRemaining = 0;
  fireCooldownRemaining = 0;
  lockedAimDir: 1 | -1 = -1;
  pendingShot = false;

  /** True for the duration of an active call-for-help response — lets
   * GameScene give it an off-screen entrance exactly once, on the frame
   * it starts responding, instead of every frame. */
  respondingToCall = false;

  private paralyzeRemaining = 0;
  private recoveringRemaining = 0;
  private shieldFlashRemaining = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind = "STANDARD", facing: 1 | -1 = -1) {
    const stats = ENEMY_STATS[kind];
    super(scene, x, y, CHARACTER_TEXTURE[kind]);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    (this.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    applyCharacterArt(this, kind);

    this.kind = kind;
    this.stats = stats;
    this.hp = stats.hp;
    this.facing = facing;
    // The figures are drawn facing right, so a left-facing soldier is the
    // mirrored one — this is also what keeps the shield trooper's shield on
    // the side it is actually blocking from (see deflectsLimb).
    this.setFlipX(facing === -1);
  }

  get isParalyzed(): boolean {
    return this.state === "PARALYZED";
  }

  get isRecovering(): boolean {
    return this.state === "RECOVERING";
  }

  get isRanged(): boolean {
    return this.stats.fireRange > 0;
  }

  get isAiming(): boolean {
    return this.aimRemaining > 0;
  }

  faceToward(targetX: number): void {
    this.facing = targetX < this.x ? -1 : 1;
    this.setFlipX(this.facing === -1);
  }

  /** True if a limb flying with this X velocity would hit the shielded
   * side — the shield only blocks frontally, and drops entirely once
   * RECOVERING. */
  deflectsLimb(limbVelX: number): boolean {
    return this.stats.shielded && this.state !== "RECOVERING" && Math.sign(limbVelX) === -this.facing;
  }

  onShieldBlock(): void {
    this.shieldFlashRemaining = SHIELD_FLASH_DURATION;
    this.contactCooldownRemaining = Math.max(this.contactCooldownRemaining, this.stats.shieldStagger);
  }

  /** Hitting a soldier with a limb paralyzes it — works from ACTIVE or
   * RECOVERING (a re-hit during the grace window is a fair "finish the job"
   * reward), but no-ops once already PARALYZED or converting. */
  paralyze(): void {
    if (this.state === "PARALYZED" || this.state === "CONVERTING") return;
    this.state = "PARALYZED";
    this.paralyzeRemaining = this.stats.paralyzeDuration;
    this.setTint(PARALYZED_TINT);
    this.setVelocityX(0);
    // A limb landing mid-windup cancels the shot — the core skill answer to
    // a Rifleman. Reset the cooldown too, so it doesn't fire an
    // already-charged shot the instant it comes back off paralysis.
    this.aimRemaining = 0;
    this.pendingShot = false;
    this.fireCooldownRemaining = Math.max(this.fireCooldownRemaining, this.stats.fireCooldown);
  }

  beginConverting(): void {
    this.state = "CONVERTING";
    this.setVelocityX(0);
    this.setTint(CONVERTING_TINT);
  }

  /** Returns true if this hit brought HP to 0 or below. */
  takeDamage(amount: number): boolean {
    if (this.state === "CONVERTING") return false;
    this.hp -= amount;
    return this.hp <= 0;
  }

  stand(): void {
    this.setVelocityX(0);
  }

  /** The one exception to "enemies stand in place" — a melee soldier
   * answering a recovering Rifleman's call for help. See
   * GameScene.updateSoldierTargeting. */
  moveToward(targetX: number): void {
    const dx = targetX - this.x;
    if (Math.abs(dx) < 10) {
      this.setVelocityX(0);
    } else {
      this.setVelocityX(Math.sign(dx) * this.stats.speed);
    }
  }

  /** Ticks the aim/fire timers. ACTIVE-only, so a paralyzed or recovering
   * Rifleman never fires — see paralyze() for what happens to a shot
   * already mid-windup when that hit lands. */
  private tickWeapon(dt: number): void {
    if (this.fireCooldownRemaining > 0) this.fireCooldownRemaining -= dt;

    if (this.aimRemaining > 0) {
      this.aimRemaining -= dt;
      if (this.aimRemaining <= 0) {
        // Commits regardless of current range — see GameScene.updateSoldierTargeting
        // for why re-checking range here would make the windup pointless.
        this.pendingShot = true;
        this.fireCooldownRemaining = this.stats.fireCooldown;
      }
      return;
    }

    if (this.fireCooldownRemaining > 0 || this.targetX === null) return;
    if (this.targetDist < this.stats.minFireRange || this.targetDist > this.stats.fireRange) return;

    this.aimRemaining = this.stats.aimDuration;
    this.lockedAimDir = this.facing;
  }

  /** Ticks cooldowns and the paralyze/recovering timers, keeps the shield
   * bar / gun barrel (if any) pinned to the facing side, and drives the
   * ranged weapon timer; movement is driven externally. */
  update(dt: number): void {
    if (this.contactCooldownRemaining > 0) this.contactCooldownRemaining -= dt;

    // The shield is part of the art now, and flipX keeps it on the side this
    // soldier actually blocks from. "Guard down" during RECOVERING is carried
    // by RECOVERING_TINT, which is why no separate shield bar is drawn.
    if (this.shieldFlashRemaining > 0 && this.state === "ACTIVE") {
      this.shieldFlashRemaining -= dt;
      this.setTint(this.shieldFlashRemaining > 0 ? BLOCK_FLASH_TINT : BASE_TINT);
    }

    if (this.isRanged && this.state === "ACTIVE") {
      this.tickWeapon(dt);
      if (this.shieldFlashRemaining <= 0) this.setTint(this.isAiming ? AIM_TINT : BASE_TINT);
    }

    if (this.state === "PARALYZED") {
      this.paralyzeRemaining -= dt;
      if (this.paralyzeRemaining <= 0) {
        this.state = "RECOVERING";
        this.recoveringRemaining = this.stats.recoveringDuration;
        this.setTint(RECOVERING_TINT);
      }
      return;
    }

    if (this.state === "RECOVERING") {
      this.recoveringRemaining -= dt;
      if (this.recoveringRemaining <= 0) {
        this.state = "ACTIVE";
        this.setTint(BASE_TINT);
      }
    }
  }

}
