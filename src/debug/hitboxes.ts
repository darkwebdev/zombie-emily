import type Phaser from "phaser";

/** Arcade Physics' debug draw — the outlined rectangle over every body.
 *
 * The graphic itself only exists when `physics.arcade.debug` is true in the
 * game config (see main.ts), so that stays on for ?debug=1; what this
 * module controls is whether it's actually *drawn*. It defaults to off:
 * now that Emily is drawn from real art, a box permanently pinned over her
 * reads as part of the character rather than as a debug overlay, which is
 * the opposite of what a debug view is for.
 *
 * The flag is module-level rather than scene state on purpose — every demo
 * button restarts the scene, and a view preference that silently reset on
 * each click would be useless.
 */
let enabled = new URLSearchParams(location.search).has("hitboxes");

export function hitboxesEnabled(): boolean {
  return enabled;
}

/** Re-applies the current setting to a scene — call from create(), since a
 * restarted scene comes back with drawDebug at its config default. */
export function applyHitboxes(scene: Phaser.Scene): void {
  const world = scene.physics.world;
  world.drawDebug = enabled;
  // Turning drawDebug off just stops future draws; whatever was drawn on
  // the last frame stays on the graphic until something clears it.
  if (!enabled) world.debugGraphic?.clear();
}

export function setHitboxes(scene: Phaser.Scene, value: boolean): void {
  enabled = value;
  applyHitboxes(scene);
}
