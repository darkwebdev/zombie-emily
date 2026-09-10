import Phaser from "phaser";
import { EMILY } from "../config/tuning";

const TEXTURE_KEY = "emily";

export class Emily extends Phaser.Physics.Arcade.Sprite {
  facing: 1 | -1 = 1;
  isFeeding = false;
  hp = EMILY.maxHp;
  private iframeRemaining = 0;
  private armLeft: Phaser.GameObjects.Rectangle;
  private armRight: Phaser.GameObjects.Rectangle;

  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;
    const g = scene.add.graphics();
    g.fillStyle(0xe0468f, 1);
    g.fillRect(0, 0, 14, 28);
    g.generateTexture(TEXTURE_KEY, 14, 28);
    g.destroy();
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Emily.ensureTexture(scene);
    super(scene, x, y, TEXTURE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.armLeft = scene.add.rectangle(x - 8, y - 6, 4, 8, 0xe0468f);
    this.armRight = scene.add.rectangle(x + 8, y - 6, 4, 8, 0xe0468f);
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  /** Moves left/right; returns false (and zeroes velocity) while feeding, since
   * feeding requires standing still. */
  handleMovement(dir: -1 | 0 | 1): void {
    if (this.isFeeding) {
      this.setVelocityX(0);
      return;
    }
    this.setVelocityX(dir * EMILY.speed);
    if (dir !== 0) this.facing = dir;
  }

  takeDamage(amount: number): void {
    if (this.iframeRemaining > 0) return;
    this.hp -= amount;
    this.iframeRemaining = EMILY.iframeDuration;
  }

  /** Ticks i-frames and keeps the arm overlays pinned to her position. */
  tick(dt: number): void {
    if (this.iframeRemaining > 0) this.iframeRemaining -= dt;
    this.armLeft.setPosition(this.x - 8, this.y - 6);
    this.armRight.setPosition(this.x + 8, this.y - 6);
  }

  setAmmoVisual(ammo: number): void {
    this.armLeft.setVisible(ammo >= 1);
    this.armRight.setVisible(ammo >= 2);
  }
}
