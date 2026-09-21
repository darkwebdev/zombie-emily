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

/** The zoom the pins are currently compensating for. Normally WORLD.zoom; the
 * debug inspector raises it to look at the art close up. */
let pinZoom = WORLD.zoom;

/** Authored (pre-offset) positions, so a zoom change can re-solve them rather
 * than compounding offsets on top of offsets. */
const pinned: { obj: Pinnable; x: number; y: number }[] = [];

/** How far a zoom of `zoom` drags a screen-pinned object toward the camera
 * centre, so adding it back cancels out.
 *
 * Derived from the canvas, not from WORLD.width. The original constant above
 * reads `WORLD.width * (zoom - 1) / 2`, which is the same thing only because
 * WORLD.width happens to equal canvas/WORLD.zoom at the design zoom — a
 * coincidence that silently breaks at every other zoom, scattering the
 * parallax layers across the screen. In canvas terms it is:
 *
 *   offset = (canvas / 2) * (1 - 1 / zoom)
 *
 * which agrees with the old constant at zoom === WORLD.zoom and stays correct
 * away from it. */
function offsetFor(zoom: number): { x: number; y: number } {
  const canvasW = WORLD.width * WORLD.zoom;
  const canvasH = WORLD.height * WORLD.zoom;
  return { x: (canvasW / 2) * (1 - 1 / zoom), y: (canvasH / 2) * (1 - 1 / zoom) };
}

/** Drops every registered pin. GameScene calls this at the top of create():
 * a restart destroys every pinned object, and without this the registry would
 * grow by a full HUD and background on every demo click. */
export function resetPins(): void {
  pinned.length = 0;
}

export function getPinZoom(): number {
  return pinZoom;
}

/** Re-seats every pinned object for a new camera zoom. Phaser zooms about the
 * camera centre, so the compensation is a function of the zoom — change one
 * without the other and the HUD and the whole parallax backdrop slide off. */
export function setPinZoom(zoom: number): void {
  pinZoom = zoom;
  const off = offsetFor(zoom);
  for (const p of pinned) p.obj.setPosition(p.x + off.x, p.y + off.y);
}

type Pinnable = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.Components.ScrollFactor;

/** Pins a game object to the screen instead of the world. Use this for every
 * HUD/overlay/backdrop element rather than a bare setScrollFactor(0). */
export function pinToScreen<T extends Pinnable>(obj: T): T {
  obj.setScrollFactor(0);
  // Remember where the caller authored it, in plain world-scale pixels, so a
  // later zoom change re-solves from that rather than from an already-offset
  // position.
  pinned.push({ obj, x: obj.x, y: obj.y });
  const off = offsetFor(pinZoom);
  obj.setPosition(obj.x + off.x, obj.y + off.y);
  return obj;
}
