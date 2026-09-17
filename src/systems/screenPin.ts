import Phaser from "phaser";
import { WORLD } from "../config/tuning";

/** Phaser zooms a camera about its center, and the game now zooms the camera
 * rather than the canvas (see main.ts and EMILY_SPRITE.artScale in tuning.ts).
 * That's invisible for world objects, but anything pinned to the screen with
 * scrollFactor 0 gets dragged toward the center by the same zoom — a HUD
 * placed at (8, 8) ends up off the top-left edge entirely.
 *
 * This is exactly how far the zoom pulls such an object, so adding it back
 * cancels out. Screen-pinned positions therefore stay authored in plain
 * world-scale pixels (8 still means "8px from the corner"), unchanged from
 * when the canvas itself was WORLD.width wide. */
export const SCREEN_PIN_OFFSET = {
  x: (WORLD.width * (WORLD.zoom - 1)) / 2,
  y: (WORLD.height * (WORLD.zoom - 1)) / 2,
};

type Pinnable = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.Components.ScrollFactor;

/** Pins a game object to the screen instead of the world. Use this for every
 * HUD/overlay/backdrop element rather than a bare setScrollFactor(0). */
export function pinToScreen<T extends Pinnable>(obj: T): T {
  obj.setScrollFactor(0);
  obj.setPosition(obj.x + SCREEN_PIN_OFFSET.x, obj.y + SCREEN_PIN_OFFSET.y);
  return obj;
}
