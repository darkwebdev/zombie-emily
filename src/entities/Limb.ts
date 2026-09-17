import Phaser from "phaser";
import { EMILY_SPRITE, GROUND_LINE, LIMB } from "../config/tuning";
import armUrl from "../assets/emily-arm.png";

/** Emily's severed arm, cut from the character board's ATTACK row by
 * tools/extract_sprites.py. Also reused as her ammo indicator (see Emily). */
export const LIMB_TEXTURE = "emily-arm";

/** The down-arrow marker floating over every thrown limb. */
export const LIMB_MARKER_TEXTURE = "limb-marker";

export class Limb extends Phaser.Physics.Arcade.Sprite {
  /** True once it has hit a soldier, deflected off a shield, or landed —
   * done flying, just resting or falling until Emily picks it up. */
  resolved = false;

  /** Down-arrow floating on a fixed line above every character's head, so a
   * limb lying on the floor (or stuck in a soldier) can be spotted without
   * hunting the ground for an 8px sprite. Owned by the limb and destroyed
   * with it — a marker with no limb under it would be a lie. */
  readonly marker: Phaser.GameObjects.Image;

  /** Call from the scene's preload(). */
  static preload(scene: Phaser.Scene): void {
    scene.load.image(LIMB_TEXTURE, armUrl);
  }

  /** Builds the marker triangle. Unlike the arm, this isn't art — it's a UI
   * affordance, so it stays a runtime-generated shape like everything else
   * that isn't a character. Call from the scene's create(). */
  static createMarkerTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(LIMB_MARKER_TEXTURE)) return;
    const { width, height, color } = LIMB.marker;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    // Apex at the bottom: the marker points down at the limb under it.
    g.fillTriangle(0, 0, width, 0, width / 2, height);
    g.generateTexture(LIMB_MARKER_TEXTURE, width, height);
    g.destroy();
  }

  constructor(scene: Phaser.Scene, x: number, y: number, facing: 1 | -1) {
    super(scene, x, y, LIMB_TEXTURE);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setFlipX(facing === -1);
    // Same oversized-art convention as Emily (see EMILY_SPRITE.artScale).
    this.setScale(EMILY_SPRITE.renderScale);
    const body = this.body as Phaser.Physics.Arcade.Body;
    // The art is wider than it is tall; the hitbox stays the square box the
    // throw was tuned against.
    body.setSize(LIMB.hitboxSize * EMILY_SPRITE.artScale, LIMB.hitboxSize * EMILY_SPRITE.artScale, true);
    body.setAllowGravity(true);
    body.setGravityY(LIMB.gravityY);
    this.setVelocity(facing * LIMB.throwSpeed, -LIMB.throwLift);
    this.marker = scene.add
      .image(x, LIMB.marker.y, LIMB_MARKER_TEXTURE)
      .setDepth(LIMB.marker.depth);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncMarker);
  }

  /** The y at which the art rests flat on the ground line. Derived from the
   * sprite's own display height rather than a tuned number, and measured
   * against GROUND_LINE (what characters' feet stand on) — NOT WORLD.groundY,
   * which is Emily's *centre* and therefore half a body above the floor. */
  get restY(): number {
    return GROUND_LINE - this.displayHeight / 2;
  }

  /** True once it has reached the floor. */
  get hasLanded(): boolean {
    return this.y >= this.restY;
  }

  /** Settles it flat on the ground rather than wherever the frame's physics
   * step happened to leave it, so it can't come to rest mid-air. Goes through
   * body.reset() rather than setY(): on an Arcade sprite the body writes its
   * own position back onto the sprite every step, so a plain setY would be
   * silently undone on the next frame. */
  land(): void {
    this.markResolved();
    (this.body as Phaser.Physics.Arcade.Body).reset(this.x, this.restY);
  }

  /** Pins the marker over the limb. Hooked to the scene's POST_UPDATE rather
   * than the sprite's preUpdate because the Arcade body writes the sprite's
   * position back after the scene updates — reading it any earlier marks
   * where the limb was last frame, which is visibly behind a thrown limb. */
  private syncMarker = (time: number): void => {
    this.marker.setPosition(
      this.x,
      LIMB.marker.y + Math.sin((time / 1000) * LIMB.marker.bobSpeed) * LIMB.marker.bobAmplitude,
    );
  };

  destroy(fromScene?: boolean): void {
    this.scene?.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncMarker);
    this.marker?.destroy();
    super.destroy(fromScene);
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
