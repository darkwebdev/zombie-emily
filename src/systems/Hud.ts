import Phaser from "phaser";
import { AGGRO, HUD, LIMB } from "../config/tuning";
import { pinToScreen } from "./screenPin";

/** Fixed top-left panel: HP bar, aggro bar, horde count, ammo. See
 * docs/FIRST_BUILD.md §2.
 *
 * Ammo lives here rather than above Emily's head: a readout that follows the
 * character moves around the screen while you play, so checking it costs a
 * saccade to wherever she happens to be. Every other resource the player
 * tracks is already on this panel, so ammo belongs on the same line of sight. */
export class Hud {
  private gfx: Phaser.GameObjects.Graphics;
  private hordeText: Phaser.GameObjects.Text;
  private pulseT = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = pinToScreen(scene.add.graphics()).setDepth(1000);
    this.hordeText = pinToScreen(
      scene.add.text(16, 58, "HORDE 0", { fontSize: "12px", color: "#ffffff" }),
    ).setDepth(1000);
    pinToScreen(
      scene.add.text(HUD.ammoLabelX, 58, "AMMO", { fontSize: "12px", color: "#ffffff" }),
    ).setDepth(1000);
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
    ammo: number,
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

    // Ammo pips: one per limb she could be carrying, filled while carried and
    // hollow once thrown, so the capacity is readable at a glance rather than
    // having to remember what the maximum is.
    for (let i = 0; i < LIMB.ammoMax; i += 1) {
      const x = HUD.ammoPipX + i * (HUD.ammoPipWidth + HUD.ammoPipGap);
      g.fillStyle(i < ammo ? HUD.ammoPipColor : HUD.ammoPipEmptyColor, 1);
      g.fillRect(x, HUD.ammoPipY, HUD.ammoPipWidth, HUD.ammoPipHeight);
      g.lineStyle(1, 0x000000, 1);
      g.strokeRect(x, HUD.ammoPipY, HUD.ammoPipWidth, HUD.ammoPipHeight);
    }

    const bruteSuffix = bruteCount > 0 ? ` (${bruteCount} BRUTE)` : "";
    this.hordeText.setText(`HORDE ${hordeCount}${bruteSuffix}`);
  }
}
