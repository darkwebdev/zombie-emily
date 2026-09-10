import Phaser from "phaser";
import { WORLD } from "../config/tuning";

const MOUNTAIN_TEX = "bg_mountains";
const TREE_TEX = "bg_trees";

// Lower = appears further away (moves less per pixel of camera scroll).
const MOUNTAIN_PARALLAX = 0.2;
const TREE_PARALLAX = 0.45;

function drawRidge(g: Phaser.GameObjects.Graphics, w: number, h: number, peaks: [number, number][]): void {
  g.beginPath();
  g.moveTo(0, h);
  for (const [x, y] of peaks) g.lineTo(x, y);
  g.lineTo(w, h);
  g.closePath();
  g.fillPath();
}

function ensureMountainTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(MOUNTAIN_TEX)) return;
  const w = 480;
  const h = 150;
  const g = scene.add.graphics();

  // Back range: darker, taller, sparser peaks.
  g.fillStyle(0x1b2030, 1);
  drawRidge(g, w, h, [
    [0, 80],
    [70, 25],
    [140, 90],
    [210, 40],
    [280, 100],
    [350, 30],
    [420, 85],
    [480, 45],
  ]);

  // Front range: lighter, shorter, offset so the repeat doesn't line up
  // with the back range and read as obviously tiled.
  g.fillStyle(0x242b40, 1);
  drawRidge(g, w, h, [
    [0, 120],
    [50, 80],
    [120, 130],
    [190, 90],
    [260, 135],
    [330, 95],
    [400, 128],
    [480, 100],
  ]);

  g.generateTexture(MOUNTAIN_TEX, w, h);
  g.destroy();
}

function ensureTreeTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TREE_TEX)) return;
  const w = 240;
  const h = 60;
  const g = scene.add.graphics();
  g.fillStyle(0x11151d, 1);

  const trees: [number, number][] = [
    [10, 42],
    [45, 52],
    [80, 36],
    [120, 48],
    [155, 40],
    [190, 50],
    [220, 34],
  ];
  for (const [x, size] of trees) {
    g.fillRect(x - 1, h - 10, 2, 10); // trunk
    g.beginPath();
    g.moveTo(x - size * 0.35, h - 8);
    g.lineTo(x, h - 8 - size);
    g.lineTo(x + size * 0.35, h - 8);
    g.closePath();
    g.fillPath();
  }

  g.generateTexture(TREE_TEX, w, h);
  g.destroy();
}

/** Two tileable silhouette layers scrolling at different rates relative to
 * the camera — the standard side-scroller parallax trick. Both TileSprites
 * are pinned to the screen (scrollFactor 0) at the full viewport width, and
 * their texture offset is driven from camera.scrollX each frame instead of
 * moving the sprites themselves, so they never run out of coverage no
 * matter how wide the level is. */
export class ParallaxBackground {
  private mountains: Phaser.GameObjects.TileSprite;
  private trees: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene) {
    ensureMountainTexture(scene);
    ensureTreeTexture(scene);

    this.mountains = scene.add
      .tileSprite(0, 0, WORLD.width, 150, MOUNTAIN_TEX)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-100);

    const treeY = WORLD.groundY + 14 - 60;
    this.trees = scene.add
      .tileSprite(0, treeY, WORLD.width, 60, TREE_TEX)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-90);
  }

  update(cameraScrollX: number): void {
    this.mountains.tilePositionX = cameraScrollX * MOUNTAIN_PARALLAX;
    this.trees.tilePositionX = cameraScrollX * TREE_PARALLAX;
  }
}
