import Phaser from "phaser";

const TEXTURE_KEY = "bullet";

/** A Rifleman's shot — flat, fast, no gravity, no pickup lifecycle. Spawned
 * on fire, resolved (hit or expired) by GunfireSystem. */
export class Bullet extends Phaser.Physics.Arcade.Sprite {
  readonly damage: number;
  readonly range: number;
  readonly spawnX: number;
  /** Position last frame, so GunfireSystem can sweep the travel interval
   * instead of missing a fast-moving hit between frames. */
  prevX: number;

  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;
    const g = scene.add.graphics();
    g.fillStyle(0xffe066, 1);
    g.fillRect(0, 0, 5, 2);
    g.generateTexture(TEXTURE_KEY, 5, 2);
    g.destroy();
  }

  constructor(scene: Phaser.Scene, x: number, y: number, dir: 1 | -1, damage: number, speed: number, range: number) {
    Bullet.ensureTexture(scene);
    super(scene, x, y, TEXTURE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.setVelocity(dir * speed, 0);
    this.damage = damage;
    this.range = range;
    this.spawnX = x;
    this.prevX = x;
  }
}
