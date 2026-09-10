import Phaser from "phaser";
import { WORLD } from "./config/tuning";
import { GameScene } from "./scenes/GameScene";
import { mountDemoPanel } from "./debug/DemoPanel";

const debugMode = new URLSearchParams(location.search).has("debug");

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: WORLD.width,
  height: WORLD.height,
  zoom: WORLD.zoom,
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

if (debugMode) {
  mountDemoPanel(game, "game");
}
