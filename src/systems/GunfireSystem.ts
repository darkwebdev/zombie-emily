import Phaser from "phaser";
import { WORLD } from "../config/tuning";
import { Bullet } from "../entities/Bullet";
import { Soldier } from "../entities/Soldier";
import { Emily } from "../entities/Emily";
import { Follower } from "../entities/Follower";

const HIT_Y_TOLERANCE = 16;
const EMILY_HALF_WIDTH = 8;

export interface GunfireResult {
  followerKilled: Follower[];
}

interface Candidate {
  isEmily: boolean;
  entity: Emily | Follower;
  dist: number;
}

/** Rifleman gunfire: spawns bullets on a soldier's completed windup, sweeps
 * their travel each frame so a fast bullet can't tunnel through a target
 * between frames, and resolves the nearest body in the bullet's path —
 * which is what makes the horde a (consumable) screen. */
export class GunfireSystem {
  private bullets: Bullet[] = [];
  private laneGfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.laneGfx = scene.add.graphics().setDepth(850);
  }

  update(soldiers: Soldier[], emily: Emily, followers: Follower[]): GunfireResult {
    const followerKilled: Follower[] = [];

    for (const s of soldiers) {
      if (!s.pendingShot) continue;
      s.pendingShot = false;
      const muzzleX = s.x + s.lockedAimDir * 9;
      this.bullets.push(
        new Bullet(s.scene, muzzleX, s.y - 6, s.lockedAimDir, s.stats.bulletDamage, s.stats.bulletSpeed, s.stats.bulletRange),
      );
    }

    this.bullets = this.bullets.filter((b) => {
      if (!b.active) return false;

      const lo = Math.min(b.prevX, b.x);
      const hi = Math.max(b.prevX, b.x);
      const candidates: Candidate[] = [];

      const check = (isEmily: boolean, entity: Emily | Follower, halfWidth: number) => {
        if (Math.abs(b.y - entity.y) > HIT_Y_TOLERANCE) return;
        if (entity.x >= lo - halfWidth && entity.x <= hi + halfWidth) {
          candidates.push({ isEmily, entity, dist: Math.abs(entity.x - b.prevX) });
        }
      };
      check(true, emily, EMILY_HALF_WIDTH);
      followers.forEach((f) => check(false, f, f.stats.hitHalfWidth));

      if (candidates.length > 0) {
        candidates.sort((a, c) => a.dist - c.dist);
        const nearest = candidates[0];
        if (nearest.isEmily) {
          (nearest.entity as Emily).takeDamage(b.damage);
        } else {
          const f = nearest.entity as Follower;
          if (f.takeDamage(b.damage)) followerKilled.push(f);
        }
        b.destroy();
        return false;
      }

      const traveled = Math.abs(b.x - b.spawnX);
      const offLevel = b.x < -20 || b.x > WORLD.levelWidth + 20;
      if (traveled > b.range || offLevel) {
        b.destroy();
        return false;
      }

      b.prevX = b.x;
      return true;
    });

    this.laneGfx.clear();
    for (const s of soldiers) {
      if (!s.isAiming) continue;
      const alpha = 0.25 + 0.55 * (1 - s.aimRemaining / s.stats.aimDuration);
      const muzzleX = s.x + s.lockedAimDir * 9;
      const endX = muzzleX + s.lockedAimDir * s.stats.fireRange;
      const x1 = Math.min(muzzleX, endX);
      const width = Math.abs(endX - muzzleX);
      this.laneGfx.fillStyle(0xff3b30, alpha);
      this.laneGfx.fillRect(x1, s.y - 1, width, 2);
    }

    return { followerKilled };
  }
}
