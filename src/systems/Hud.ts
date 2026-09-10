import Phaser from "phaser";
import { AGGRO } from "../config/tuning";

/** Fixed top-left panel: HP bar, aggro bar, horde count. See
 * docs/FIRST_BUILD.md §2. */
export class Hud {
  private gfx: Phaser.GameObjects.Graphics;
  private hordeText: Phaser.GameObjects.Text;
  private pulseT = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(1000);
    this.hordeText = scene.add
      .text(16, 58, "HORDE 0", { fontSize: "12px", color: "#ffffff" })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  update(
    dt: number,
    hp: number,
    maxHp: number,
    aggro: number,
    aggroFull: boolean,
    rejectFlashRemaining: number,
    hordeCount: number,
    bruteCount: number,
  ): void {
    this.pulseT += dt;
    const g = this.gfx;
    g.clear();

    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(8, 8, 236, 66, 4);

    // HP bar
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(16, 16, 220, 18);
    g.fillStyle(0xc0392b, 1);
    g.fillRect(16, 16, 220 * Phaser.Math.Clamp(hp / maxHp, 0, 1), 18);
    g.lineStyle(1, 0x000000, 1);
    g.strokeRect(16, 16, 220, 18);

    // Aggro bar
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(16, 42, 220, 10);
    if (rejectFlashRemaining > 0) {
      g.fillStyle(0xffffff, 1);
      g.fillRect(16, 42, 220, 10);
    } else if (aggroFull) {
      const alpha = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin((this.pulseT * Math.PI * 2) / 0.5));
      g.fillStyle(0x6fe3ff, alpha);
      g.fillRect(16, 42, 220, 10);
    } else {
      g.fillStyle(0xe08a1e, 1);
      g.fillRect(16, 42, 220 * Phaser.Math.Clamp(aggro / AGGRO.max, 0, 1), 10);
    }
    g.lineStyle(1, 0x000000, 1);
    g.strokeRect(16, 42, 220, 10);

    const bruteSuffix = bruteCount > 0 ? ` (${bruteCount} BRUTE)` : "";
    this.hordeText.setText(`HORDE ${hordeCount}${bruteSuffix}`);
  }
}
