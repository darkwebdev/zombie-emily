import Phaser from "phaser";
import { COMBAT } from "../config/tuning";
import { Emily } from "../entities/Emily";
import { Soldier } from "../entities/Soldier";
import { Follower } from "../entities/Follower";

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
}

/** A follower's reach applies symmetrically — a Brute can be bitten from
 * the same distance it can bite from, so it doesn't get an invisible,
 * confusing one-sided advantage. */
export function touchingFollower(soldier: Soldier, follower: Follower): boolean {
  return distance(soldier, follower) <= Math.max(COMBAT.contactRange, follower.stats.reach);
}

function touchingEmily(soldier: Soldier, emily: Emily): boolean {
  return distance(soldier, emily) <= COMBAT.contactRange;
}

export interface CombatResult {
  soldierKilled: Soldier[];
  followerKilled: Follower[];
}

/** Bidirectional contact damage: followers bite soldiers, soldiers hit back
 * unless paralyzed. Runs after Soldier/Follower movement each frame. */
export class CombatSystem {
  update(dt: number, emily: Emily, followers: Follower[], soldiers: Soldier[]): CombatResult {
    const soldierKilled: Soldier[] = [];
    const followerKilled: Follower[] = [];

    followers.forEach((f) => f.tickCooldown(dt));

    for (const soldier of soldiers) {
      if (soldier.state !== "CONVERTING") {
        for (const follower of followers) {
          if (follower.biteCooldownRemaining > 0) continue;
          if (touchingFollower(soldier, follower)) {
            follower.biteCooldownRemaining = follower.stats.biteCooldown;
            const dmg = soldier.isParalyzed
              ? follower.stats.biteDamage * soldier.stats.defenselessDamageMult
              : follower.stats.biteDamage;
            if (soldier.takeDamage(dmg) && !soldierKilled.includes(soldier)) {
              soldierKilled.push(soldier);
            }
          }
        }
      }

      // contactDamage > 0 guard: a 0-damage soldier (the Rifleman) would
      // otherwise still call emily.takeDamage(0), which grants a free
      // 0.6s i-frame window that absorbs every OTHER soldier's hit.
      if (soldier.state === "ACTIVE" && soldier.contactCooldownRemaining <= 0 && soldier.stats.contactDamage > 0) {
        if (touchingEmily(soldier, emily)) {
          emily.takeDamage(soldier.stats.contactDamage);
          soldier.contactCooldownRemaining = soldier.stats.contactCooldown;
        } else {
          const target = followers.find((f) => touchingFollower(soldier, f));
          if (target) {
            if (target.takeDamage(soldier.stats.contactDamage) && !followerKilled.includes(target)) {
              followerKilled.push(target);
            }
            soldier.contactCooldownRemaining = soldier.stats.contactCooldown;
          }
        }
      }
    }

    return { soldierKilled, followerKilled };
  }
}
