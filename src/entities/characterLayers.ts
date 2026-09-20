import Phaser from "phaser";
import { CHARACTER_ART, EnemyKind, FollowerKind } from "../config/tuning";

/** One image in a character's stack, drawn in array order (index 0 is the
 * body, later entries draw over it).
 *
 * **Every layer shares its base's canvas size and feet-flush footing.** That
 * is the contract, not an accident of the current art: `applyCharacterArt`
 * solves `originY` from the texture's own height because the extractor emits
 * figures with their feet on the bottom row, and the `artRoster` test asserts
 * feet-on-the-ground-line for every kind. A layer cut to a tight bounding box
 * around, say, a helmet would have a different height, so the same origin
 * maths would seat it somewhere else entirely and every character would float
 * or sink. Padding equipment out to the full figure canvas costs a few KB of
 * transparent pixels and removes that whole class of bug.
 *
 * `dx`/`dy` exist for deliberate offsets *within* that shared canvas (a helmet
 * that should sit two pixels higher), not for tight-cropped images. They are
 * in source-texture pixels, authored as if the figure faces right; `dx` is
 * mirrored automatically when the character flips. */
export interface CharacterLayer {
  texture: string;
  dx?: number;
  dy?: number;
}

/** The composition recipe per kind.
 *
 * Today every kind is a single layer — the same flat figure the board has
 * always produced — so the stack below creates no child sprites at all and
 * the game renders exactly as it did before. Adding modular art means adding
 * entries here; nothing else has to change. See issue #37. */
export const CHARACTER_LAYERS: Record<EnemyKind | FollowerKind, CharacterLayer[]> = {
  STANDARD: [{ texture: "enemy-standard" }],
  SHIELD: [{ texture: "enemy-shield" }],
  RIFLEMAN: [{ texture: "enemy-rifleman" }],
  BASE: [{ texture: "follower-base" }],
  BRUTE: [{ texture: "follower-brute" }],
};

/** Stand-in equipment texture for the `artLayers` demo.
 *
 * The modular art #37 calls for doesn't exist yet — the board holds finished
 * figures, and a drawn soldier can't be mechanically separated into body plus
 * helmet. So the layering machinery is proven against a generated placeholder
 * instead of waiting on authoring: a visible band drawn on a full-figure
 * canvas, which is exactly the shape real equipment layers have to be. */
export const DEBUG_LAYER_TEXTURE = "debug-equipment-layer";

/** Builds the placeholder at a given base texture's exact size, so it honours
 * the same-canvas contract the real layers will have to. */
export function createDebugLayerTexture(scene: Phaser.Scene, likeTexture: string): void {
  if (scene.textures.exists(DEBUG_LAYER_TEXTURE)) return;
  const source = scene.textures.get(likeTexture).getSourceImage();
  const w = source.width;
  const h = source.height;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // A band across the head/shoulders — high enough to read as worn gear
  // rather than as a box around the whole figure.
  g.fillStyle(0x00e5ff, 0.85);
  g.fillRect(w * 0.2, h * 0.08, w * 0.6, h * 0.12);
  g.generateTexture(DEBUG_LAYER_TEXTURE, w, h);
  g.destroy();
}

/** Layers sit immediately above their own character in the global depth sort,
 * never far enough to cross into the next one. The follower band already
 * separates characters by `seed * 1e-4` (see HORDE_SPREAD), so stepping by
 * 1e-6 keeps a whole stack inside one character's slice — a hundred layers
 * would still fit between two neighbours. */
const LAYER_DEPTH_STEP = 1e-6;

/** Holds the extra sprites drawn over a character and keeps them glued to it.
 *
 * Phaser has no built-in "sprite with attachments" that also keeps an Arcade
 * body, and wrapping each character in a Container would move the physics body
 * off the sprite the whole codebase already treats as the entity. So the
 * character stays exactly the sprite it was — the base layer — and this mirrors
 * its transform onto plain, body-less sprites drawn just above it.
 *
 * Mirroring happens every frame rather than at each mutation point on purpose:
 * the parent's position is written by Arcade physics, its depth is rewritten
 * per-frame by `GameScene.updateFollowerDepths`, and its tint is set from seven
 * different places in `Soldier`. Hooking all of those would mean a desync the
 * first time one was missed — and the failure would be silent and visual, like
 * a paralyzed soldier with a green body and an untinted helmet. */
export class CharacterLayerStack {
  private readonly sprites: Phaser.GameObjects.Sprite[] = [];
  private readonly specs: CharacterLayer[];
  private readonly scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    private readonly parent: Phaser.Physics.Arcade.Sprite,
    kind: EnemyKind | FollowerKind,
  ) {
    // Index 0 is the parent itself, which already exists — only the overlays
    // need new sprites. With today's single-layer art this loop body never
    // runs, so a character costs exactly what it always did.
    this.scene = scene;
    this.specs = CHARACTER_LAYERS[kind].slice(1);
    for (const spec of this.specs) {
      const sprite = scene.add.sprite(parent.x, parent.y, spec.texture);
      this.sprites.push(sprite);
    }
    this.sync();
  }

  /** True when this character draws as more than its base image. Lets callers
   * skip work (and tests assert) without reaching into the array. */
  get isLayered(): boolean {
    return this.sprites.length > 0;
  }

  /** Adds an image over this character after construction.
   *
   * This is the capability runtime compositing was chosen for over flattening
   * the layers at build time (#37): equipment can change on a character that
   * already exists — a helmet knocked off, gear stripped as a soldier
   * converts — without swapping the whole figure for a different texture.
   * Build-time compositing can't express that, because by then the character
   * is one baked image. */
  addLayer(spec: CharacterLayer): void {
    const sprite = this.scene.add.sprite(this.parent.x, this.parent.y, spec.texture);
    this.specs.push(spec);
    this.sprites.push(sprite);
    this.sync();
  }

  /** Removes the topmost layer drawn from `texture`, if present. Returns
   * whether anything was removed. */
  removeLayer(texture: string): boolean {
    const i = this.specs.map((s) => s.texture).lastIndexOf(texture);
    if (i < 0) return false;
    this.sprites[i].destroy();
    this.sprites.splice(i, 1);
    this.specs.splice(i, 1);
    this.sync();
    return true;
  }

  /** Read-only view for tests and the debug panel. */
  get layerSprites(): readonly Phaser.GameObjects.Sprite[] {
    return this.sprites;
  }

  /** Copies everything visual from the parent onto each overlay. Cheap enough
   * to run unconditionally: a handful of property writes per layer, and no
   * layers at all for unlayered kinds. */
  sync(): void {
    if (this.sprites.length === 0) return;
    const { renderScale } = CHARACTER_ART;
    const p = this.parent;

    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const spec = this.specs[i];

      // Authored facing right, so a flipped character mirrors the x offset —
      // otherwise a helmet nudged toward the face would jump to the back of
      // the head the moment the soldier turned.
      const dx = (spec.dx ?? 0) * renderScale * (p.flipX ? -1 : 1);
      const dy = (spec.dy ?? 0) * renderScale;

      sprite.setPosition(p.x + dx, p.y + dy);
      sprite.setOrigin(p.originX, p.originY);
      sprite.setScale(p.scaleX, p.scaleY);
      sprite.setFlipX(p.flipX);
      sprite.setAlpha(p.alpha);
      sprite.setVisible(p.visible);
      sprite.setDepth(p.depth + LAYER_DEPTH_STEP * (i + 1));

      // State tints (paralyze green, aim red, the shield's block flash) are
      // how the player reads a soldier, so they have to reach the whole
      // figure rather than just the body underneath the gear.
      if (p.isTinted) sprite.setTint(p.tintTopLeft);
      else sprite.clearTint();
    }
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
  }
}
