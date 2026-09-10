import Phaser from "phaser";
import { LIMB } from "../config/tuning";

const TEXTURE_KEY = "limb";

export class Limb extends Phaser.Physics.Arcade.Sprite {
  /** True once it has hit a soldier, deflected off a shield, or landed —
   * done flying, just resting or falling until Emily picks it up. */
  resolved = false;

  static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;
    const g = scene.add.graphics();
    g.fillStyle(0xd8b48c, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture(TEXTURE_KEY, 8, 8);
    g.destroy();
  }

  constructor(scene: Phaser.Scene, x: number, y: number, facing: 1 | -1) {
    Limb.ensureTexture(scene);
    super(scene, x, y, TEXTURE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    body.setGravityY(LIMB.gravityY);
    this.setVelocity(facing * LIMB.throwSpeed, -LIMB.throwLift);
  }

  markResolved(): void {
    this.resolved = true;
    this.setVelocity(0, 0);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  }

  /** Bounces off a shield back toward the thrower instead of sticking —
   * gravity stays on, so it arcs down and lands like a miss. */
  deflect(dirX: 1 | -1, bounceX: number, bounceY: number): void {
    this.resolved = true;
    this.setVelocity(dirX * bounceX, bounceY);
  }
}
