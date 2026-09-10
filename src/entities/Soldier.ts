import Phaser from "phaser";
import { ENEMY_STATS, EnemyKind, SHIELD_FLASH_DURATION, SOLDIER } from "../config/tuning";

const TEXTURE_KEY = "soldier";
const SHIELD_TEXTURE_KEY = "soldier_shield";
const RIFLE_TEXTURE_KEY = "soldier_rifle";
const BASE_TINT: Record<EnemyKind, number> = {
  STANDARD: 0x5a5a3c,
  SHIELD: 0x6c7a89,
  RIFLEMAN: 0x9c5a3c,
};
const PARALYZED_TINT = 0x2bff5e;
const RECOVERING_TINT = 0xffb433;
const CONVERTING_TINT = 0x1fae46;
const BLOCK_FLASH_TINT = 0xffffff;
const SHIELD_BAR_COLOR = 0xc8d4e0;
const BARREL_COLOR = 0x3a3a3a;
const BARREL_AIM_COLOR = 0xff3b30;

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
  private shieldBar: Phaser.GameObjects.Rectangle | null = null;
  private barrel: Phaser.GameObjects.Rectangle | null = null;

  static ensureTexture(scene: Phaser.Scene): void {
    if (!scene.textures.exists(TEXTURE_KEY)) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 12, 28);
      g.generateTexture(TEXTURE_KEY, 12, 28);
      g.destroy();
    }
    if (!scene.textures.exists(SHIELD_TEXTURE_KEY)) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 16, 28);
      g.generateTexture(SHIELD_TEXTURE_KEY, 16, 28);
      g.destroy();
    }
    if (!scene.textures.exists(RIFLE_TEXTURE_KEY)) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 10, 28);
      g.generateTexture(RIFLE_TEXTURE_KEY, 10, 28);
      g.destroy();
    }
  }

  constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind = "STANDARD", facing: 1 | -1 = -1) {
    Soldier.ensureTexture(scene);
    const stats = ENEMY_STATS[kind];
    const textureKey = stats.shielded ? SHIELD_TEXTURE_KEY : stats.fireRange > 0 ? RIFLE_TEXTURE_KEY : TEXTURE_KEY;
    super(scene, x, y, textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    (this.body as Phaser.Physics.Arcade.Body).setImmovable(true);

    this.kind = kind;
    this.stats = stats;
    this.hp = stats.hp;
    this.facing = facing;
    this.setTint(BASE_TINT[kind]);

    if (stats.shielded) {
      this.shieldBar = scene.add.rectangle(x + facing * 9, y - 2, 3, 20, SHIELD_BAR_COLOR);
    }
    if (stats.fireRange > 0) {
      this.barrel = scene.add.rectangle(x + facing * 8, y - 6, 8, 3, BARREL_COLOR);
    }
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

    if (this.shieldBar) {
      this.shieldBar.setPosition(this.x + this.facing * 9, this.y - 2);
      // Hidden during RECOVERING/CONVERTING — the guard is down, and the
      // missing bar is the only signal the front is open.
      this.shieldBar.setVisible(this.state === "ACTIVE" || this.state === "PARALYZED");
    }

    if (this.barrel) {
      const dir = this.isAiming ? this.lockedAimDir : this.facing;
      this.barrel.setPosition(this.x + dir * 8, this.y - 6);
      this.barrel.setFillStyle(this.isAiming ? BARREL_AIM_COLOR : BARREL_COLOR);
    }

    if (this.shieldFlashRemaining > 0 && this.state === "ACTIVE") {
      this.shieldFlashRemaining -= dt;
      this.setTint(this.shieldFlashRemaining > 0 ? BLOCK_FLASH_TINT : BASE_TINT[this.kind]);
    }

    if (this.isRanged && this.state === "ACTIVE") this.tickWeapon(dt);

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
        this.setTint(BASE_TINT[this.kind]);
      }
    }
  }

  destroy(fromScene?: boolean): void {
    this.shieldBar?.destroy();
    this.barrel?.destroy();
    super.destroy(fromScene);
  }
}
