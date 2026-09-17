import Phaser from "phaser";
import { BACKGROUND, WORLD } from "../config/tuning";
import { pinToScreen } from "./screenPin";
import farUrl from "../assets/bg-far.png";
import midUrl from "../assets/bg-mid.png";
import fenceUrl from "../assets/bg-fence.png";
import groundUrl from "../assets/bg-ground.png";

const URLS: Record<string, string> = {
  "bg-far": farUrl,
  "bg-mid": midUrl,
  "bg-fence": fenceUrl,
  "bg-ground": groundUrl,
};

/** The parallax layers cut from the environment board by
 * tools/extract_background.py, back to front, each scrolling at its own
 * fraction of camera speed — the standard side-scroller depth trick.
 *
 * Every layer is a TileSprite pinned to the screen (scrollFactor 0) at the
 * full viewport width, with its texture *offset* driven from the camera each
 * frame rather than the sprite being moved. That's what lets a 320px-wide
 * object cover a 3200px level without ever running out of coverage — and
 * it's why the street (parallax 1) is a screen-pinned tile too, rather than
 * one enormous level-wide image. */
export class ParallaxBackground {
  // The configured key is kept alongside the sprite because a TileSprite's
  // own `texture` is the internal canvas fill-pattern Phaser builds for it
  // (its key is a generated UUID), not the source image.
  private layers: { key: string; sprite: Phaser.GameObjects.TileSprite; parallax: number; artScale: number }[] = [];


  /** What each layer has actually been scrolled to, for the debug suite —
   * the parallax rates are otherwise invisible to anything but the eye, and
   * they have silently broken once already (camera.scrollX is in screen
   * pixels once the camera is zoomed, which made every layer scroll 3x too
   * fast). */
  get debugOffsets(): { key: string; tilePositionX: number; parallax: number; artScale: number }[] {
    return this.layers.map((l) => ({
      key: l.key,
      tilePositionX: l.sprite.tilePositionX,
      parallax: l.parallax,
      artScale: l.artScale,
    }));
  }

  /** Call from the scene's preload(). */
  static preload(scene: Phaser.Scene): void {
    for (const layer of BACKGROUND.layers) {
      scene.load.image(layer.key, URLS[layer.key]);
    }
  }

  constructor(scene: Phaser.Scene) {
    for (const layer of BACKGROUND.layers) {
      const height = scene.textures.get(layer.key).getSourceImage().height / layer.artScale;
      const sprite = pinToScreen(
        scene.add.tileSprite(0, layer.y, WORLD.width, height, layer.key).setOrigin(0, 0),
      ).setDepth(layer.depth);
      // The texture is artScale times denser than the world, so the tiling
      // has to shrink to match; without this a 3x-scale layer would draw a
      // third of itself blown up across the screen.
      sprite.setTileScale(1 / layer.artScale, 1 / layer.artScale);
      this.layers.push({ key: layer.key, sprite, parallax: layer.parallax, artScale: layer.artScale });
    }
  }

  /** cameraScrollX is the world x of the camera's left edge
   * (camera.worldView.x) — world units, so the parallax rates stay in the
   * same units they were tuned in regardless of camera zoom. */
  update(cameraScrollX: number): void {
    for (const { sprite, parallax, artScale } of this.layers) {
      // Phaser shifts a TileSprite by tilePositionX * tileScaleX (see
      // TileSpriteWebGLRenderer), so a tileScale of 1/artScale means the
      // offset has to be expressed in texture pixels to land on the world
      // pixels actually wanted.
      sprite.tilePositionX = cameraScrollX * parallax * artScale;
    }
  }
}
