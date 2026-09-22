import Phaser from "phaser";
import { CHARACTER_ART, EnemyKind, FollowerKind, GROUND_LINE } from "../config/tuning";
import { CHARACTER_LAYERS } from "./characterLayers";

import standardUrl from "../assets/enemy-standard.png";
import shieldUrl from "../assets/enemy-shield.png";
import riflemanUrl from "../assets/enemy-rifleman.png";
import baseUrl from "../assets/follower-base.png";
import bruteUrl from "../assets/follower-brute.png";

// Modular layer set, cut from art/modules-prev-board.png by
// tools/extract_modules.py — see its docstring for why that board and not the
// other one. The bases are fully clothed, so the pieces here are the few
// things worn on top: a hood, weapons, a shield, two belt items.
import humanBaseUrl from "../assets/human-base.png";
import infectedBaseUrl from "../assets/infected-base.png";
import headHoodUrl from "../assets/head-hood.png";
import rifleAssaultUrl from "../assets/rifle-assault.png";
import rifleSniperUrl from "../assets/rifle-sniper.png";
import shieldRiotUrl from "../assets/shield-riot.png";
import pistolUrl from "../assets/pistol.png";
import accGrenadeUrl from "../assets/acc-grenade.png";
import accMedkitUrl from "../assets/acc-medkit.png";

/** Texture key per character kind — the *base* layer, which is the texture the
 * entity sprite itself carries and the one `applyCharacterArt` sizes and seats
 * everything against.
 *
 * Derived from `CHARACTER_LAYERS` rather than written out again, so the base
 * can't drift from layer 0 of the composition recipe. Anything drawn over it
 * lives in that manifest — see characterLayers.ts. */
export const CHARACTER_TEXTURE: Record<EnemyKind | FollowerKind, string> = Object.fromEntries(
  Object.entries(CHARACTER_LAYERS).map(([kind, layers]) => [kind, layers[0].texture]),
) as Record<EnemyKind | FollowerKind, string>;

const URLS: Record<string, string> = {
  "enemy-standard": standardUrl,
  "enemy-shield": shieldUrl,
  "enemy-rifleman": riflemanUrl,
  "follower-base": baseUrl,
  "follower-brute": bruteUrl,
  "human-base": humanBaseUrl,
  "infected-base": infectedBaseUrl,
  "head-hood": headHoodUrl,
  "rifle-assault": rifleAssaultUrl,
  "rifle-sniper": rifleSniperUrl,
  "shield-riot": shieldRiotUrl,
  pistol: pistolUrl,
  "acc-grenade": accGrenadeUrl,
  "acc-medkit": accMedkitUrl,
};

/** Call from the scene's preload(). One call covers every enemy and follower
 * kind, so neither entity has to know about the other's art.
 *
 * Loads every texture any layer references, not just the bases — a layer
 * listed in CHARACTER_LAYERS whose image was never loaded would render as a
 * green box, which is a confusing way to find out about a typo. */
export function preloadCharacterArt(scene: Phaser.Scene): void {
  const needed = new Set(Object.values(CHARACTER_LAYERS).flatMap((ls) => ls.map((l) => l.texture)));
  for (const key of needed) {
    const url = URLS[key];
    if (!url) {
      throw new Error(`CHARACTER_LAYERS references texture "${key}" with no entry in URLS (characterArt.ts)`);
    }
    scene.load.image(key, url);
  }
}

/** Sizes and seats a freshly constructed enemy/follower sprite on its art.
 *
 * Two things have to hold, and neither can be hardcoded per kind because the
 * figures are all different sizes:
 *
 * 1. **Feet on the ground line.** The extractor emits every figure with its
 *    feet flush against the bottom edge of the image, so the sprite's bottom
 *    edge *is* its feet. originY is solved from the texture's own height so
 *    the bottom edge lands on `groundLine` — which also means a kind with a
 *    spawnYOffset (BRUTE) needs no art-side compensation, because the offset
 *    is already in the y passed in here.
 *
 *    `groundLine` is a parameter rather than always the global GROUND_LINE
 *    because followers stand on their own line a few px nearer or further
 *    down the street (see HORDE_SPREAD). Solving originY against the global
 *    line would make that offset cancel out exactly: the sprite's y would
 *    move and the drawn figure wouldn't.
 * 2. **The hitbox is unchanged by the art.** The body is set explicitly to the
 *    kind's world box from CHARACTER_ART.hitbox and seated bottom-centred, so
 *    it stays exactly the rectangle the gameplay was tuned against rather than
 *    growing to the silhouette. Arcade sizes bodies in source-texture pixels
 *    and then applies the sprite's scale, so the world box is divided back out
 *    by renderScale here (the same trick Emily uses).
 */
export function applyCharacterArt(
  sprite: Phaser.Physics.Arcade.Sprite,
  kind: EnemyKind | FollowerKind,
  groundLine: number = GROUND_LINE,
): void {
  const { artScale, renderScale, hitbox } = CHARACTER_ART;
  const box = hitbox[kind];
  const source = sprite.texture.getSourceImage();
  const texHeight = source.height;
  const texWidth = source.width;
  const displayHeight = texHeight * renderScale;

  sprite.setScale(renderScale);
  sprite.setOrigin(0.5, 1 - (groundLine - sprite.y) / displayHeight);

  const body = sprite.body as Phaser.Physics.Arcade.Body;
  const bodyW = box.width * artScale;
  const bodyH = box.height * artScale;
  body.setSize(bodyW, bodyH, false);
  body.setOffset((texWidth - bodyW) / 2, texHeight - bodyH);
}
