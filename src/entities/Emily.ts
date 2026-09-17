import Phaser from "phaser";
import { EMILY, EMILY_SPRITE } from "../config/tuning";
import idleUrl from "../assets/emily-idle.png";
import walkUrl from "../assets/emily-walk.png";
import throwUrl from "../assets/emily-throw.png";

const SHEETS = {
  idle: { key: "emily-idle", url: idleUrl },
  walk: { key: "emily-walk", url: walkUrl },
  throw: { key: "emily-throw", url: throwUrl },
} as const;

/** Exported so the debug suite can assert which animation is on screen. */
export const EMILY_ANIM = {
  idle: "emily-idle-anim",
  walk: "emily-walk-anim",
  throw: "emily-throw-anim",
} as const;

export class Emily extends Phaser.Physics.Arcade.Sprite {
  facing: 1 | -1 = 1;
  isFeeding = false;
  hp = EMILY.maxHp;
  private iframeRemaining = 0;

  /** Call from the scene's preload(). The sheets are cut from the character
   * board by tools/extract_sprites.py. */
  static preload(scene: Phaser.Scene): void {
    const { frameWidth, frameHeight } = EMILY_SPRITE;
    for (const sheet of Object.values(SHEETS)) {
      scene.load.spritesheet(sheet.key, sheet.url, { frameWidth, frameHeight });
    }
  }

  private static ensureAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists(EMILY_ANIM.idle)) return;
    const define = (key: string, textureKey: string, frameRate: number) => {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(textureKey, {}),
        frameRate,
        repeat: key === EMILY_ANIM.throw ? 0 : -1,
      });
    };
    define(EMILY_ANIM.idle, SHEETS.idle.key, EMILY_SPRITE.idleFps);
    define(EMILY_ANIM.walk, SHEETS.walk.key, EMILY_SPRITE.walkFps);
    define(EMILY_ANIM.throw, SHEETS.throw.key, EMILY_SPRITE.throwFps);
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Emily.ensureAnimations(scene);
    super(scene, x, y, SHEETS.idle.key, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, EMILY_SPRITE.originY);
    // Frames are authored at artScale; drawn back down to world scale here.
    this.setScale(EMILY_SPRITE.renderScale);
    this.setCollideWorldBounds(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    // Explicit size + offset rather than the frame bounds: the hitbox has to
    // stay the 14x28 world box the gameplay was tuned against. Arcade sizes a
    // body in source-texture pixels and then applies the sprite's scale, so
    // the world size is divided back out by renderScale here.
    body.setSize(
      EMILY_SPRITE.bodyWidth * EMILY_SPRITE.artScale,
      EMILY_SPRITE.bodyHeight * EMILY_SPRITE.artScale,
      false,
    );
    body.setOffset(EMILY_SPRITE.bodyOffsetX, EMILY_SPRITE.bodyOffsetY);
    this.play(EMILY_ANIM.idle);
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  /** Moves left/right; zeroes velocity while feeding, since feeding requires
   * standing still. speedScale is only ever passed by the debug animation
   * preview (see GameScene.driveAnimPreview) — real input always moves her at
   * the full EMILY.speed. */
  handleMovement(dir: -1 | 0 | 1, speedScale = 1): void {
    if (this.isFeeding) {
      this.setVelocityX(0);
      return;
    }
    this.setVelocityX(dir * EMILY.speed * speedScale);
    if (dir !== 0) this.facing = dir;
  }

  takeDamage(amount: number): void {
    if (this.iframeRemaining > 0) return;
    this.hp -= amount;
    this.iframeRemaining = EMILY.iframeDuration;
  }

  /** True while the one-shot throw animation is still on screen. */
  get isThrowAnimPlaying(): boolean {
    return this.anims.currentAnim?.key === EMILY_ANIM.throw && this.anims.isPlaying;
  }

  /** Plays the throw once; the locomotion animations resume the moment it
   * finishes. Purely cosmetic — GameScene still owns the actual throw. */
  playThrow(): void {
    this.play(EMILY_ANIM.throw, true);
  }

  /** Ticks i-frames and picks the locomotion animation. */
  tick(dt: number): void {
    if (this.iframeRemaining > 0) this.iframeRemaining -= dt;
    this.setFlipX(this.facing === -1);
    this.updateAnimation();
  }

  /** Idle or walk — walk is her only locomotion cycle. */
  private updateAnimation(): void {
    if (this.isThrowAnimPlaying) return;
    const speed = Math.abs((this.body as Phaser.Physics.Arcade.Body).velocity.x);
    this.play(speed < 1 ? EMILY_ANIM.idle : EMILY_ANIM.walk, true);
  }
}
