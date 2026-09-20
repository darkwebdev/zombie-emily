import Phaser from "phaser";
import { AGGRO, HUD, LIMB, WORLD } from "../config/tuning";
import { pinToScreen } from "./screenPin";

/** Fixed top-left panel: HP bar, aggro bar, horde count, ammo. See
 * docs/FIRST_BUILD.md §2.
 *
 * Ammo lives here rather than above Emily's head: a readout that follows the
 * character moves around the screen while you play, so checking it costs a
 * saccade to wherever she happens to be. Every other resource the player
 * tracks is already on this panel, so ammo belongs on the same line of sight.
 *
 * Every coordinate comes from HUD in tuning.ts — see the note there on why
 * the numbers look small (they're world pixels, magnified by WORLD.zoom) and
 * on keeping the contents inside the panel. */
export class Hud {
  private gfx: Phaser.GameObjects.Graphics;
  private hordeText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private ammoText: Phaser.GameObjects.Text;
  private pulseT = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = pinToScreen(scene.add.graphics()).setDepth(1000);
    this.hordeText = pinToScreen(
      scene.add.text(HUD.hordeTextX, HUD.textY, "HORDE 0", {
        fontSize: HUD.fontSize,
        color: "#ffffff",
        resolution: WORLD.zoom,
      }),
    ).setDepth(1000);
    this.ammoText = pinToScreen(
      scene.add.text(HUD.ammoLabelX, HUD.textY, "AMMO", {
        fontSize: HUD.fontSize,
        color: "#ffffff",
        resolution: WORLD.zoom,
      }),
    ).setDepth(1000);
    // Right-aligned and vertically centred on the HP bar, so the digits stay
    // put as the bar drains instead of tracking its edge. Drawn after the
    // graphics object but on the same depth, which is enough: Phaser breaks
    // depth ties by display-list order, and the bar is added first.
    this.hpText = pinToScreen(
      scene.add
        .text(HUD.barX + HUD.barWidth - HUD.hpTextRightInset, HUD.hpY + HUD.hpHeight / 2, "", {
          fontSize: HUD.barFontSize,
          color: "#ffffff",
          // The camera magnifies the HUD by WORLD.zoom, so text rasterised at
          // 1x arrives on screen soft. Rendering it at the zoom factor makes
          // it land 1:1 on real pixels — the same reasoning as the canvas
          // being sized in screen pixels in main.ts. Matters more here than
          // anywhere else: these are the smallest glyphs in the game.
          resolution: WORLD.zoom,
        })
        .setOrigin(1, 0.5),
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

    g.fillStyle(0x000000, HUD.panelAlpha);
    g.fillRoundedRect(HUD.panelX, HUD.panelY, HUD.panelWidth, HUD.panelHeight, HUD.panelRadius);

    // HP bar
    g.fillStyle(HUD.hpBackColor, 1);
    g.fillRect(HUD.barX, HUD.hpY, HUD.barWidth, HUD.hpHeight);
    g.fillStyle(HUD.hpFillColor, 1);
    g.fillRect(HUD.barX, HUD.hpY, HUD.barWidth * Phaser.Math.Clamp(hp / maxHp, 0, 1), HUD.hpHeight);
    g.lineStyle(1, 0x000000, 1);
    g.strokeRect(HUD.barX, HUD.hpY, HUD.barWidth, HUD.hpHeight);

    // Aggro bar
    g.fillStyle(HUD.aggroBackColor, 1);
    g.fillRect(HUD.barX, HUD.aggroY, HUD.barWidth, HUD.aggroHeight);
    if (rejectFlashRemaining > 0) {
      g.fillStyle(0xffffff, 1);
      g.fillRect(HUD.barX, HUD.aggroY, HUD.barWidth, HUD.aggroHeight);
    } else if (aggroFull) {
      const alpha =
        0.65 + 0.35 * (0.5 + 0.5 * Math.sin((this.pulseT * Math.PI * 2) / HUD.aggroPulsePeriod));
      g.fillStyle(HUD.aggroFullColor, alpha);
      g.fillRect(HUD.barX, HUD.aggroY, HUD.barWidth, HUD.aggroHeight);
    } else {
      g.fillStyle(HUD.aggroFillColor, 1);
      g.fillRect(
        HUD.barX,
        HUD.aggroY,
        HUD.barWidth * Phaser.Math.Clamp(aggro / AGGRO.max, 0, 1),
        HUD.aggroHeight,
      );
    }
    g.lineStyle(1, 0x000000, 1);
    g.strokeRect(HUD.barX, HUD.aggroY, HUD.barWidth, HUD.aggroHeight);

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

    // Abbreviated because the label shares its row with AMMO now: the old
    // " (3 BRUTE)" suffix is wider than the gap between them and would draw
    // straight through it.
    const bruteSuffix = bruteCount > 0 ? ` (${bruteCount}B)` : "";
    this.hordeText.setText(`HORDE ${hordeCount}${bruteSuffix}`);
    this.hpText.setText(`${Math.max(0, Math.ceil(hp))}/${maxHp}`);
    this.ammoText.setText(`AMMO ${ammo}`);
  }
}
