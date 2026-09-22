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
export type AnchorName = "head" | "chest" | "hips" | "hand" | "back";

/** Where a piece of gear hangs off the body, as a fraction of the base
 * texture. y is measured from the figure's feet (1 = feet, 0 = top of head),
 * because that is the one line every character is guaranteed to share — the
 * bases are emitted feet-flush and applyCharacterArt seats them on the ground
 * line, so anchoring from the bottom stays stable even when two kinds are
 * different heights. */
export const ANCHORS: Record<AnchorName, { x: number; y: number }> = {
  head: { x: 0.5, y: 0.90 },
  chest: { x: 0.5, y: 0.68 },
  hips: { x: 0.5, y: 0.48 },
  hand: { x: 0.62, y: 0.58 },
  back: { x: 0.5, y: 0.70 },
};

export interface CharacterLayer {
  texture: string;
  /** Which anchor this hangs off. Omit for a layer already drawn in place on
   * a full-figure canvas (the bases, and any pre-aligned art). */
  anchor?: AnchorName;
  /** Nudge from the anchor, in base-texture pixels, authored facing right —
   * dx is mirrored automatically when the character flips. */
  dx?: number;
  dy?: number;
  /** Multiplies the layer's own size. Source art is rarely drawn at the size
   * it occupies on the body, so this is the knob that makes a trouser image
   * actually span waist to boots. */
  scale?: number;
}

/** The composition recipe per kind.
 *
 * The bases are **fully clothed figures**, so a stack is a body plus the two
 * or three things actually worn on top of it — never a body being assembled
 * out of parts. That is what tools/extract_modules.py's docstring is about:
 * dressing a minimal-clothing body meant every layer had to seam against its
 * neighbours, and a trouser layer that fell a few pixels short left bare
 * shins. Here a missing layer can only mean a missing accessory.
 *
 * A consequence worth stating plainly: STANDARD and SHIELD wear **no head
 * layer**, because the base is already drawn in a helmet with goggles. Only
 * RIFLEMAN replaces the head, with the hooded jacket the board's own SNIPER
 * example uses. See issue #37. */
export const CHARACTER_LAYERS: Record<EnemyKind | FollowerKind, CharacterLayer[]> = {
  // Layer 0 is the body, drawn full-figure and feet-flush, so it carries no
  // anchor. Everything above it is a loose item parked on an anchor — the
  // numbers below were dialled in with the gear-fitting panel (?debug=1, Gear
  // tab) and can be re-dialled there any time without re-cutting art.
  STANDARD: [{ texture: "human-base" }, { texture: "rifle-assault", anchor: "hand", scale: 0.9 }],
  RIFLEMAN: [
    { texture: "human-base" },
    { texture: "head-hood", anchor: "head", dy: -2, scale: 1.05 },
    { texture: "rifle-sniper", anchor: "hand", scale: 0.9 },
  ],
  // The pistol is what the board's SHIELD variant carries: a shield trooper
  // with a rifle as well would read as the same silhouette as a STANDARD.
  SHIELD: [
    { texture: "human-base" },
    { texture: "shield-riot", anchor: "chest", dx: 9, scale: 1.2 },
    { texture: "pistol", anchor: "hand", dx: -8, scale: 0.9 },
  ],
  // Its own base, not the human one re-tinted — and then a soldier's kit worn
  // over it, which is what makes a conversion read as "that used to be a
  // soldier". No weapon: the board marks the infected weapon column (NONE),
  // and a follower that shoots is a different design question entirely.
  BASE: [{ texture: "infected-base" }, { texture: "acc-grenade", anchor: "hips", dx: 5, dy: -1 }],
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
  private readonly kind: EnemyKind | FollowerKind;

  constructor(
    scene: Phaser.Scene,
    private readonly parent: Phaser.Physics.Arcade.Sprite,
    kind: EnemyKind | FollowerKind,
  ) {
    // Index 0 is the parent itself, which already exists — only the overlays
    // need new sprites. With today's single-layer art this loop body never
    // runs, so a character costs exactly what it always did.
    this.scene = scene;
    this.kind = kind;
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

      // Authored facing right, so a flipped character mirrors every x offset —
      // otherwise a rifle held out to the right jumps behind the soldier the
      // moment he turns.
      const mirror = p.flipX ? -1 : 1;
      const layerScale = spec.scale ?? 1;

      if (spec.anchor) {
        // Anchored gear: a tight-cropped image parked at a point on the body,
        // positioned here rather than baked into the PNG. That is what lets
        // the fitting panel move it live — and what lets loose, unaligned
        // source art be used at all.
        const a = ANCHORS[spec.anchor];
        const baseW = p.width;
        const baseH = p.height;
        // Anchor x is a fraction across the body from its centre. Anchor y is
        // a fraction UP from the feet, and Phaser's +y points down, so it has
        // to be subtracted. The origin is not necessarily at the feet either
        // (applyCharacterArt solves originY so the bottom edge lands on the
        // ground line), so the feet are (1 - originY) * height below it.
        const ax = (a.x - 0.5) * baseW + (spec.dx ?? 0);
        const feetBelowOrigin = (1 - p.originY) * baseH;
        const ay = feetBelowOrigin - a.y * baseH + (spec.dy ?? 0);
        sprite.setOrigin(0.5, 0.5);
        sprite.setPosition(p.x + ax * p.scaleX * mirror, p.y + ay * p.scaleY);
        sprite.setScale(p.scaleX * layerScale, p.scaleY * layerScale);
      } else {
        // Pre-aligned full-figure layer: share the body's own seating exactly.
        const dx = (spec.dx ?? 0) * renderScale * mirror;
        const dy = (spec.dy ?? 0) * renderScale;
        sprite.setPosition(p.x + dx, p.y + dy);
        sprite.setOrigin(p.originX, p.originY);
        sprite.setScale(p.scaleX * layerScale, p.scaleY * layerScale);
      }
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

  /** Tears the overlays down and rebuilds them from the manifest as it
   * currently stands. The fitting panel mutates CHARACTER_LAYERS live, and a
   * stack built at spawn would otherwise keep drawing the old spec. */
  rebuild(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    this.specs.length = 0;
    for (const spec of CHARACTER_LAYERS[this.kind].slice(1)) {
      this.specs.push(spec);
      this.sprites.push(this.scene.add.sprite(this.parent.x, this.parent.y, spec.texture));
    }
    this.sync();
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
  }
}
