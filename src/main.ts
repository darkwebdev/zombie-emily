import Phaser from "phaser";
import { WORLD } from "./config/tuning";
import { GameScene } from "./scenes/GameScene";
import { mountDemoPanel } from "./debug/DemoPanel";
import { mountGearFitPanel } from "./debug/GearFitPanel";
import { mountTouchControls } from "./systems/touchControls";

const debugMode = new URLSearchParams(location.search).has("debug");

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  // The canvas is sized in *screen* pixels and the camera does the zooming
  // (GameScene.create), rather than Phaser's `zoom` option, which only
  // stretches a WORLD.width-sized canvas with CSS. That distinction is the
  // whole reason Emily's art can carry real detail: this way the render
  // target genuinely has WORLD.zoom times the pixels, so her artScale-sized
  // frames land 1:1 on it instead of being resampled down to world scale.
  // FIT scales the finished canvas (via CSS) to whatever the window is,
  // preserving aspect ratio and letterboxing the remainder — so the render
  // target keeps its exact WORLD.zoom pixel dimensions above and phones just
  // see it scaled. Without this the canvas stays a fixed 960x540 and
  // overflows every phone screen.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WORLD.width * WORLD.zoom,
    height: WORLD.height * WORLD.zoom,
  },
  pixelArt: true,
  backgroundColor: "#1a1a2e",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: debugMode,
    },
  },
  scene: [GameScene],
});

mountTouchControls();

if (debugMode) {
  mountDemoPanel(game, "game");
  mountGearFitPanel(game, "game");
}
