import Phaser from "phaser";
import { WORLD, EMILY, LIMB, HORDE_CAP, COMBAT, AGGRO, FUSION } from "../config/tuning";
import type { DemoName } from "../debug/demos";
import type { EnemyKind, FollowerKind } from "../config/tuning";
import { Emily } from "../entities/Emily";
import { Soldier } from "../entities/Soldier";
import { Follower } from "../entities/Follower";
import { Limb } from "../entities/Limb";
import { BreadcrumbTrail } from "../systems/BreadcrumbTrail";
import { CombatSystem } from "../systems/CombatSystem";
import { AggroSystem } from "../systems/AggroSystem";
import { GunfireSystem } from "../systems/GunfireSystem";
import { ParallaxBackground } from "../systems/ParallaxBackground";
import { Hud } from "../systems/Hud";
import { SPAWNS } from "../levels/level1";

interface PendingConversion {
  soldier: Soldier;
  timer: number;
}

interface StuckLimb {
  sprite: Limb;
  soldier: Soldier;
}

const CONVERT_DURATION = 1.0;
// Phaser's per-frame delta is real wall-clock elapsed time. Any main-thread
// stall (a backgrounded tab, a GC pause, a slow frame) would otherwise hand
// us one huge dt that fast-forwards timers/combat/paralysis by several
// seconds in a single tick. Clamp it so one frame can never simulate more
// than this much game time, no matter how long was actually lost.
const MAX_DT = 1 / 20;

export class GameScene extends Phaser.Scene {
  private emily!: Emily;
  private soldiers: Soldier[] = [];
  private followers: Follower[] = [];
  private limbs: Limb[] = [];
  /** Embedded in a paralyzed soldier; falls once it converts or recovers. */
  private stuckLimbs: StuckLimb[] = [];
  /** Released from a soldier and dropping under gravity. */
  private fallingLimbs: Limb[] = [];
  /** Resting on the ground; picked up when Emily touches it. */
  private groundedLimbs: Limb[] = [];
  private pendingConversions: PendingConversion[] = [];
  private trail = new BreadcrumbTrail();
  private combat = new CombatSystem();
  private aggro = new AggroSystem();
  private gunfire!: GunfireSystem;
  private background!: ParallaxBackground;
  private hud!: Hud;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private throwCooldownRemaining = 0;
  private ammo = LIMB.ammoMax;

  private feedProgress = 0;
  private feedBar!: Phaser.GameObjects.Graphics;

  private isGameOver = false;
  private isCleared = false;

  private debugMode = false;
  private debugLabels: Phaser.GameObjects.Text[] = [];
  /** Set by runDemo() just before a restart; applied once the fresh scene's
   * create() has finished setting up, so every demo starts from a clean
   * slate instead of stacking on top of leftover state. */
  private pendingDemo: DemoName | null = null;

  constructor() {
    super("game");
  }

  create(): void {
    this.isGameOver = false;
    this.isCleared = false;
    this.debugMode = new URLSearchParams(location.search).has("debug");
    this.ammo = LIMB.ammoMax;
    this.soldiers = [];
    this.followers = [];
    this.limbs = [];
    this.stuckLimbs = [];
    this.fallingLimbs = [];
    this.groundedLimbs = [];
    this.pendingConversions = [];
    this.trail = new BreadcrumbTrail();
    this.aggro = new AggroSystem();
    this.gunfire = new GunfireSystem(this);

    this.physics.world.gravity.y = 0;
    this.physics.world.setBounds(0, 0, WORLD.levelWidth, WORLD.height);

    this.background = new ParallaxBackground(this);

    this.add
      .rectangle(0, WORLD.groundY + 14, WORLD.levelWidth, 4, 0x333333)
      .setOrigin(0, 0);

    this.emily = new Emily(this, 80, WORLD.groundY);
    this.emily.setAmmoVisual(this.ammo);

    // A demo other than plain "reset" spawns only the characters it needs
    // (see applyDemo), instead of the full level.
    if (!this.pendingDemo || this.pendingDemo === "reset") {
      for (const spawn of SPAWNS) {
        this.soldiers.push(new Soldier(this, spawn.x, WORLD.groundY, spawn.kind, spawn.facing));
      }
    }

    this.feedBar = this.add.graphics().setDepth(900);
    this.hud = new Hud(this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    this.cameras.main.setBounds(0, 0, WORLD.levelWidth, WORLD.height);
    // lerpX 1 = no smoothing lag, Emily stays pinned to the horizontal center
    // every frame; lerpY 0 keeps the camera from ever panning vertically,
    // since flat-ground levels never move Emily's y.
    this.cameras.main.startFollow(this.emily, true, 1, 0);

    // Console/automation access for debugging — same gate as the demo panel.
    if (this.debugMode) {
      (window as unknown as { __scene: GameScene }).__scene = this;
    }

    if (this.pendingDemo) {
      const demo = this.pendingDemo;
      this.pendingDemo = null;
      this.applyDemo(demo);
    }
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_DT);

    if (this.isGameOver) return;
    if (this.isCleared) {
      if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.scene.restart();
      return;
    }

    this.handleFeed(dt);
    this.handleMovementAndThrow(dt);
    this.emily.tick(dt);

    this.trail.update(dt * 1000, this.emily.x);

    this.aggro.update(dt, this.followers.length);
    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.aggro.tryActivate(this.followers, this.soldiers);
    }
    this.aggro.resolveRushExits(this.followers);

    // Walked in rank order (front to back) so each unit's trail offset can
    // accumulate the trailSpacing of everyone ahead of it — a mixed roster
    // (a tight-spacing Brute up front, wider-spacing base followers behind)
    // can't use a flat rank*spacing formula.
    let trailOffset = 0;
    [...this.followers]
      .sort((a, b) => a.rank - b.rank)
      .forEach((f) => {
        trailOffset += f.stats.trailSpacing;
        if (f.mode === "RUSH" && f.rushTarget) {
          f.rushToward(f.rushTarget.x);
          f.hasJoined = false; // once the rush ends, wait here rather than snapping back to the trail
          return;
        }
        const nearbyTarget = this.findNearestEngageable(f);
        if (nearbyTarget) {
          f.followTarget(nearbyTarget.x);
          f.hasJoined = false; // once this fight ends, wait here rather than snapping back to the trail
          return;
        }
        // A follower waits in place — doesn't chase the trail — until
        // Emily's own position moves past where it's standing.
        if (!f.hasJoined) f.checkJoined(this.emily.x, this.emily.facing);
        if (f.hasJoined) {
          f.followTarget(this.trail.targetXForOffset(trailOffset));
        } else {
          f.setVelocityX(0);
        }
      });

    this.updateSoldierTargeting();
    this.soldiers.forEach((s) => s.update(dt));

    const gunResult = this.gunfire.update(this.soldiers, this.emily, this.followers);
    gunResult.followerKilled.forEach((f) => this.removeFollower(f));

    const result = this.combat.update(dt, this.emily, this.followers, this.soldiers);
    result.soldierKilled.forEach((s) => this.beginConversion(s));
    result.followerKilled.forEach((f) => this.removeFollower(f));

    this.tickConversions(dt);
    this.checkFusion();

    this.handleLimbHits();
    this.updateFlyingLimbs();
    this.limbs = this.limbs.filter((l) => l.active && !l.resolved);
    this.updateStuckLimbs();
    this.updateFallingLimbs();
    this.handleLimbPickup();

    this.background.update(this.cameras.main.scrollX);

    this.hud.update(
      dt,
      this.emily.hp,
      EMILY.maxHp,
      this.aggro.value,
      this.aggro.isFull,
      this.aggro.rejectFlashRemaining,
      this.followers.length,
      this.followers.filter((f) => f.isBrute).length,
    );

    if (this.emily.isDead) {
      this.triggerDeath();
      return;
    }
    if (this.soldiers.length === 0 && this.pendingConversions.length === 0 && !this.isCleared) {
      this.showCleared();
    }

    this.updateDebugLabels();
  }

  /** Labels that would land close enough on X to overlap get stacked
   * upward instead — X never moves, only Y. Recomputed fresh every frame,
   * so a cluster un-stacks back to its natural Y the instant its members
   * spread back out. */
  private updateDebugLabels(): void {
    if (!this.debugMode) return;
    this.debugLabels.forEach((t) => t.destroy());
    this.debugLabels = [];

    const entries: { x: number; y: number; text: string }[] = [
      { x: this.emily.x, y: this.emily.y, text: `EMILY hp:${this.emily.hp} ammo:${this.ammo}` },
      ...this.soldiers.map((s) => {
        const prefix = s.kind === "SHIELD" ? "SHIELD " : s.kind === "RIFLEMAN" ? "RIFLE " : "";
        const aim = s.isAiming ? ` aim:${s.aimRemaining.toFixed(1)}` : "";
        return { x: s.x, y: s.y, text: `${prefix}${s.state} f:${s.facing}${aim}` };
      }),
      ...this.followers.map((f) => ({
        x: f.x,
        y: f.y,
        text: `${f.isBrute ? "BRUTE " : ""}${f.mode} hp:${f.hp}${f.hasJoined ? "" : " WAIT"}`,
      })),
    ];

    const OVERLAP_X = 40;
    const STACK_STEP = 10;
    const sorted = [...entries].sort((a, b) => a.x - b.x);

    let clusterStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
      const endOfCluster = i === sorted.length || sorted[i].x - sorted[i - 1].x > OVERLAP_X;
      if (!endOfCluster) continue;

      for (let j = clusterStart; j < i; j++) {
        const entry = sorted[j];
        const y = entry.y - 34 - (j - clusterStart) * STACK_STEP;
        this.debugLabels.push(
          this.add.text(entry.x, y, entry.text, { fontSize: "8px", color: "#ffffff" }).setOrigin(0.5).setDepth(999),
        );
      }
      clusterStart = i;
    }
  }

  private handleMovementAndThrow(dt: number): void {
    let dir: -1 | 0 | 1 = 0;
    if (this.cursors.left.isDown) dir = -1;
    else if (this.cursors.right.isDown) dir = 1;
    this.emily.handleMovement(dir);

    this.throwCooldownRemaining -= dt;
    if (
      Phaser.Input.Keyboard.JustDown(this.keyJ) &&
      this.throwCooldownRemaining <= 0 &&
      !this.emily.isFeeding &&
      this.ammo > 0
    ) {
      this.throwLimb();
    }
  }

  /** The actual throw action — ammo cost, cooldown, and the limb's real
   * launch velocity (LIMB.throwSpeed/throwLift via Limb's constructor),
   * fired from Emily's current position and facing. The J-key handler
   * above and the test API's debugThrowLimb() both funnel through this, so
   * a scripted "throw" is the same throw a player would actually make. */
  private throwLimb(): void {
    this.throwCooldownRemaining = LIMB.throwCooldown;
    this.ammo -= 1;
    this.emily.setAmmoVisual(this.ammo);
    const offsetX = this.emily.facing * 12;
    const limb = new Limb(this, this.emily.x + offsetX, this.emily.y - 4, this.emily.facing);
    this.limbs.push(limb);
  }

  /** A follower not already rushing breaks off the trail on its own to
   * close on any soldier within engageRadius, so it keeps fighting even
   * while Emily is standing still. */
  private findNearestEngageable(follower: Follower): Soldier | null {
    let nearest: Soldier | null = null;
    let nearestDist = follower.stats.engageRadius;
    for (const soldier of this.soldiers) {
      if (soldier.state === "CONVERTING") continue;
      const d = Phaser.Math.Distance.Between(follower.x, follower.y, soldier.x, soldier.y);
      if (d <= nearestDist) {
        nearestDist = d;
        nearest = soldier;
      }
    }
    return nearest;
  }

  private nearestZombieX(soldier: Soldier, radius: number): { x: number; dist: number } | null {
    let bestDist = radius;
    let bestX: number | null = null;

    const emilyDist = Phaser.Math.Distance.Between(soldier.x, soldier.y, this.emily.x, this.emily.y);
    if (emilyDist <= bestDist) {
      bestDist = emilyDist;
      bestX = this.emily.x;
    }
    for (const f of this.followers) {
      const d = Phaser.Math.Distance.Between(soldier.x, soldier.y, f.x, f.y);
      if (d <= bestDist) {
        bestDist = d;
        bestX = f.x;
      }
    }
    return bestX === null ? null : { x: bestX, dist: bestDist };
  }

  /** Soldiers never reposition — they stand at their spawn X for their
   * whole lifetime. Emily's movement is the only thing that creates
   * dynamics; soldiers only turn to face the nearest threat (which still
   * matters: it decides the Shield Trooper's deflect side and the
   * Rifleman's locked aim direction) and fight whoever comes to them. */
  private updateSoldierTargeting(): void {
    // Recovering Riflemen call for help — any melee soldier not already
    // busy with its own fight will walk to guard them. Recomputed fresh
    // every frame, so the response starts and ends exactly with the
    // RECOVERING window (converts, dies, or times back to ACTIVE all end it).
    const callers = this.soldiers.filter((s) => s.state === "RECOVERING" && s.stats.callForHelpRadius > 0);

    for (const soldier of this.soldiers) {
      if (soldier.state === "ACTIVE") {
        const target = this.nearestZombieX(soldier, soldier.stats.detectRadius);
        soldier.targetX = target?.x ?? null;
        soldier.targetDist = target?.dist ?? Infinity;

        // Only actual melee contact counts as "busy" — merely having
        // Emily or a follower somewhere inside the much larger detectRadius
        // doesn't, or a call for help would almost never win against it in
        // real play (detectRadius is 260-320px vs a 16px contact range).
        const inContact = target !== null && target.dist <= COMBAT.contactRange;

        if (inContact) {
          soldier.respondingToCall = false;
          soldier.stand();
          if (!soldier.isRanged || !soldier.isAiming) soldier.faceToward(target!.x);
          continue;
        }

        if (!soldier.isRanged) {
          // Already mid-charge from an earlier call: keep closing on
          // whatever it can see, even once the Rifleman that called it
          // has already recovered — a soldier mid-charge doesn't stop
          // just because its ally is safe now. This is also what makes
          // the charge actually reach Emily at all: the entrance places
          // it ~160px+ away (camera's right edge), further than the
          // RECOVERING window (1.2s x 70 speed = 84px) could ever close,
          // so the attack has to outlive the call that triggered it.
          if (soldier.respondingToCall && target) {
            soldier.faceToward(target.x);
            soldier.moveToward(target.x);
            continue;
          }

          if (!soldier.respondingToCall) {
            const caller = this.nearestCaller(soldier, callers);
            if (caller) {
              // Entrance: arrives from the right edge of the camera's
              // current view, instead of a soldier that was already
              // standing on screen just starting to walk.
              soldier.setX(this.cameras.main.scrollX + WORLD.width + 20);
              soldier.respondingToCall = true;
              // Head for whatever's actually threatening the caller
              // (almost always Emily, since she's the one who paralyzed
              // it), falling back to the caller's own position only if
              // nothing's close enough to it to identify yet.
              const threat = this.nearestZombieX(caller, caller.stats.detectRadius);
              soldier.faceToward(threat?.x ?? caller.x);
              soldier.moveToward(threat?.x ?? caller.x);
              continue;
            }
          }
        }
        soldier.respondingToCall = false;

        soldier.stand();
        // Facing freezes once a Rifleman's windup starts — a committed
        // shot fires in the locked direction even if Emily crosses past it.
        if (target && (!soldier.isRanged || !soldier.isAiming)) soldier.faceToward(target.x);
      } else if (soldier.state === "RECOVERING") {
        const target = this.nearestZombieX(soldier, soldier.stats.detectRadius);
        soldier.stand();
        if (target) soldier.faceToward(target.x);
      }
    }
  }

  private nearestCaller(soldier: Soldier, callers: Soldier[]): Soldier | null {
    let nearest: Soldier | null = null;
    let nearestDist = Infinity;
    for (const caller of callers) {
      if (caller === soldier) continue;
      const d = Phaser.Math.Distance.Between(soldier.x, soldier.y, caller.x, caller.y);
      if (d <= caller.stats.callForHelpRadius && d < nearestDist) {
        nearestDist = d;
        nearest = caller;
      }
    }
    return nearest;
  }

  private beginConversion(soldier: Soldier): void {
    soldier.beginConverting();
    this.pendingConversions.push({ soldier, timer: CONVERT_DURATION });
  }

  private tickConversions(dt: number): void {
    this.pendingConversions = this.pendingConversions.filter((entry) => {
      entry.timer -= dt;
      if (entry.timer > 0) return true;
      this.finishConversion(entry.soldier);
      return false;
    });
  }

  /** HORDE_CAP is a slot budget, not a headcount — see tuning.ts. */
  private usedSlots(): number {
    return this.followers.reduce((sum, f) => sum + f.stats.slotCost, 0);
  }

  /** Removes the soldier and, if the horde has slot room, spawns a base
   * follower in its place (always 1 slot). Shared by the normal 1.0s
   * CONVERTING delay and demo shortcuts that skip straight to the result. */
  private finishConversion(soldier: Soldier): void {
    this.soldiers = this.soldiers.filter((s) => s !== soldier);
    if (this.usedSlots() + 1 <= HORDE_CAP) {
      const rank = this.followers.length;
      this.followers.push(new Follower(this, soldier.x, soldier.y, rank));
    }
    soldier.destroy();
  }

  private removeFollower(dead: Follower): void {
    const deadRank = dead.rank;
    this.followers = this.followers.filter((f) => f !== dead);
    this.followers.forEach((f) => {
      if (f.rank > deadRank) f.rank -= 1;
    });
    dead.destroy();
  }

  private insertFollowerAtFront(follower: Follower): void {
    this.followers.forEach((f) => (f.rank += 1));
    follower.rank = 0;
    this.followers.unshift(follower);
  }

  /** Automatic — no player input, no cost check to pass. The instant 4 base
   * followers exist, they merge into one Brute (see BRUTE in tuning.ts).
   * Runs right after conversions so a fusion never waits a frame. A while
   * loop covers the rare case of multiple conversions landing the same
   * tick and pushing the base count past 4 in one jump. */
  private checkFusion(): void {
    for (;;) {
      const base = this.followers.filter((f) => f.kind === "BASE");
      if (base.length < FUSION.requiredBase) return;

      const consumed = base.slice(0, FUSION.requiredBase);
      const spawnX = consumed.reduce((sum, f) => sum + f.x, 0) / consumed.length;
      const spawnY = consumed.reduce((sum, f) => sum + f.y, 0) / consumed.length;
      // If any consumed follower had already joined the trail, the Brute
      // inherits that — it's a continuation of already-moving followers,
      // not a fresh spawn that should freeze and wait for Emily again.
      const alreadyJoined = consumed.some((f) => f.hasJoined);

      consumed.forEach((f) => this.removeFollower(f));

      const brute = new Follower(this, spawnX, spawnY, 0, "BRUTE");
      brute.hasJoined = alreadyJoined;
      this.insertFollowerAtFront(brute);
    }
  }

  private handleLimbHits(): void {
    for (const limb of this.limbs) {
      if (!limb.active || limb.resolved) continue;
      for (const soldier of this.soldiers) {
        if (soldier.state !== "ACTIVE" && soldier.state !== "RECOVERING") continue;
        if (this.physics.overlap(limb, soldier)) {
          const velX = (limb.body as Phaser.Physics.Arcade.Body).velocity.x;
          if (soldier.deflectsLimb(velX)) {
            soldier.onShieldBlock();
            limb.deflect(soldier.facing, soldier.stats.deflectBounceX, soldier.stats.deflectBounceY);
            this.fallingLimbs.push(limb);
            break;
          }
          soldier.paralyze();
          limb.markResolved();
          this.stuckLimbs.push({ sprite: limb, soldier });
          break;
        }
      }
    }
  }

  private updateFlyingLimbs(): void {
    for (const limb of this.limbs) {
      if (!limb.active || limb.resolved) continue;
      const landed = limb.y >= WORLD.groundY;
      const offLevel = limb.x < -20 || limb.x > WORLD.levelWidth + 20;
      if (landed || offLevel) {
        limb.markResolved();
        this.groundedLimbs.push(limb);
      }
    }
  }

  /** A limb embedded in a paralyzed soldier drops free — falling to the
   * ground for pickup — the moment that soldier converts or its paralysis
   * runs out, whichever comes first. */
  private updateStuckLimbs(): void {
    this.stuckLimbs = this.stuckLimbs.filter((entry) => {
      if (entry.soldier.state === "PARALYZED") return true;
      if (entry.sprite.active) {
        (entry.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
        this.fallingLimbs.push(entry.sprite);
      }
      return false;
    });
  }

  private updateFallingLimbs(): void {
    this.fallingLimbs = this.fallingLimbs.filter((limb) => {
      if (!limb.active) return false;
      if (limb.y >= WORLD.groundY) {
        limb.markResolved();
        this.groundedLimbs.push(limb);
        return false;
      }
      return true;
    });
  }

  /** Ammo only returns when Emily actually walks up and touches a dropped
   * limb — no passive timer. */
  private handleLimbPickup(): void {
    this.groundedLimbs = this.groundedLimbs.filter((limb) => {
      if (!limb.active) return false;
      if (Phaser.Math.Distance.Between(this.emily.x, this.emily.y, limb.x, limb.y) <= COMBAT.contactRange) {
        limb.destroy();
        this.ammo = Math.min(LIMB.ammoMax, this.ammo + 1);
        this.emily.setAmmoVisual(this.ammo);
        return false;
      }
      return true;
    });
  }

  private handleFeed(dt: number): void {
    // Feeding is automatic on touch, same contact range as a follower's
    // bite — no key required, but Emily has to actually reach the target,
    // not just be nearby. She's locked in place for the duration, which is
    // the cost of the free conversion.
    const nearestParalyzed = this.soldiers
      .filter((s) => s.isParalyzed)
      .find((s) => Phaser.Math.Distance.Between(this.emily.x, this.emily.y, s.x, s.y) <= COMBAT.contactRange);

    if (nearestParalyzed) {
      this.emily.isFeeding = true;
      this.feedProgress += dt;
      this.drawFeedBar(nearestParalyzed);

      if (this.feedProgress >= EMILY.feedTime) {
        this.completeFeed(nearestParalyzed);
      }
    } else {
      this.feedProgress = 0;
      this.emily.isFeeding = false;
      this.feedBar.clear();
    }
  }

  private drawFeedBar(target: Soldier): void {
    const pct = Phaser.Math.Clamp(this.feedProgress / EMILY.feedTime, 0, 1);
    this.feedBar.clear();
    this.feedBar.fillStyle(0x000000, 0.6);
    this.feedBar.fillRect(target.x - 16, target.y - 24, 32, 4);
    this.feedBar.fillStyle(0x6fe3ff, 1);
    this.feedBar.fillRect(target.x - 16, target.y - 24, 32 * pct, 4);
  }

  private completeFeed(target: Soldier): void {
    this.feedBar.clear();
    this.emily.isFeeding = false;
    this.feedProgress = 0;
    this.beginConversion(target);
  }

  private triggerDeath(): void {
    this.isGameOver = true;
    this.cameras.main.fadeOut(EMILY.deathFadeDuration * 1000, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart();
    });
  }

  private showCleared(): void {
    this.isCleared = true;
    this.add
      .text(WORLD.width / 2, WORLD.height / 2, "CLEARED — press R", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);
  }

  /** Spawns a soldier at a fixed offset from Emily's current position —
   * everything a demo (other than "reset") ever needs. */
  private spawnSoldierNear(offsetX: number, kind: EnemyKind = "STANDARD", facing: 1 | -1 = -1): Soldier {
    const s = new Soldier(this, this.emily.x + offsetX, WORLD.groundY, kind, facing);
    this.soldiers.push(s);
    return s;
  }

  /** Spawns a follower directly, skipping the conversion pipeline entirely
   * — a demo that needs a horde member doesn't need a soldier to convert
   * it from. */
  private spawnFollowerNear(offsetX: number, kind: FollowerKind = "BASE"): Follower {
    const rank = this.followers.length;
    const f = new Follower(this, this.emily.x + offsetX, WORLD.groundY, rank, kind);
    this.followers.push(f);
    return f;
  }

  /** Debug-panel entry point (see src/debug/DemoPanel.ts) — every demo
   * resets the scene first, so it always starts from a clean slate rather
   * than stacking on top of whatever the last demo left behind. The actual
   * scenario runs once the fresh scene's create() has finished (see the
   * pendingDemo check at the end of create()). */
  runDemo(name: DemoName): void {
    this.pendingDemo = name;
    this.scene.restart();
  }

  /** Each case spawns only the characters that specific scenario needs —
   * "reset" is the only one that gets the full level (spawned in create()). */
  private applyDemo(name: DemoName): void {
    switch (name) {
      case "reset": {
        break;
      }
      case "paralyze": {
        // Within contact range (offset 12 < COMBAT.contactRange 16), so the
        // demo actually proves a paralyzed soldier can't hit Emily back —
        // not just that it visually turns green.
        this.spawnSoldierNear(12).paralyze();
        break;
      }
      case "recovering": {
        const s = this.spawnSoldierNear(40);
        s.paralyze();
        for (let i = 0; i < 62 && s.state === "PARALYZED"; i++) s.update(0.1);
        break;
      }
      case "feed": {
        // offset 0: spawns already touching Emily, so auto-feed triggers immediately
        this.spawnSoldierNear(0).paralyze();
        break;
      }
      case "defenseless": {
        // Paired up 40px out, clear of Emily's own contact range: she'd
        // otherwise be the one auto-feeding on it and the one soaking any
        // retaliation (CombatSystem checks her before the followers), which
        // would hide whether a paralyzed target can fight back at all.
        this.spawnFollowerNear(40);
        this.spawnSoldierNear(40).paralyze();
        break;
      }
      case "aggroReady": {
        this.spawnFollowerNear(-20);
        this.spawnFollowerNear(-40);
        this.aggro.value = AGGRO.max;
        this.spawnSoldierNear(200);
        break;
      }
      case "limbDrop": {
        // Ammo spent, as it would be after actually throwing the limb
        // that's now stuck in this soldier — so the drop is the only way
        // to get it back, and "picked up by touch" is a real claim to
        // watch (and to test) rather than a no-op on a full quiver.
        this.ammo = 0;
        this.emily.setAmmoVisual(this.ammo);
        const s = this.spawnSoldierNear(40);
        s.paralyze();
        const limb = new Limb(this, s.x, s.y - 4, 1);
        limb.markResolved();
        this.stuckLimbs.push({ sprite: limb, soldier: s });
        this.beginConversion(s);
        break;
      }
      case "hordeCap": {
        // 4 Brutes = 8 slots = the cap, exactly. Spawned directly as
        // BRUTE so they don't also trigger auto-fusion (that only fires
        // on 4+ BASE followers). They're inside engageRadius of the
        // soldier below, so they close and execute it unprompted — no
        // feed from Emily needed to reach the blocked conversion.
        for (let i = 0; i < 4; i++) this.spawnFollowerNear(-40 - i * 24, "BRUTE");
        this.spawnSoldierNear(40).paralyze();
        break;
      }
      case "death": {
        this.emily.hp = 1;
        this.spawnSoldierNear(12);
        break;
      }
      case "cleared": {
        // Zero soldiers spawned — the normal end-of-update check sees an
        // empty, all-converted level and fires CLEARED on the very next frame.
        break;
      }
      case "shieldBlock": {
        // Facing -1: shield presents toward Emily, who's to its left —
        // throw at it and watch the deflect bounce the limb back at her.
        this.spawnSoldierNear(50, "SHIELD", -1);
        break;
      }
      case "shieldFlank": {
        this.spawnFollowerNear(-20);
        this.spawnFollowerNear(-40);
        this.aggro.value = AGGRO.max;
        this.spawnSoldierNear(120, "SHIELD", -1);
        break;
      }
      case "gunnerShot": {
        // Inside fireRange, Emily stationary: watch the windup, the red
        // lane, and the hit. Throw at it to see the interrupt.
        this.spawnSoldierNear(120, "RIFLEMAN", -1);
        break;
      }
      case "gunnerBlock": {
        // The follower sits in the lane and eats the shot — consumable
        // cover in one hit.
        this.spawnFollowerNear(60);
        this.spawnSoldierNear(120, "RIFLEMAN", -1);
        break;
      }
      case "gunnerRush": {
        this.spawnFollowerNear(-20);
        this.spawnFollowerNear(-40);
        this.aggro.value = AGGRO.max;
        this.spawnSoldierNear(200, "RIFLEMAN", -1);
        break;
      }
      case "fusionAuto": {
        // 4 base followers — checkFusion() sees this on the very next
        // frame and merges them automatically. No key press.
        this.spawnFollowerNear(-10);
        this.spawnFollowerNear(-25);
        this.spawnFollowerNear(-40);
        this.spawnFollowerNear(-55);
        break;
      }
      case "bruteExecute": {
        // biteDamage 5 * defenselessDamageMult 2 = 10, one-shots a
        // paralyzed SHIELD (9hp) — the Brute's whole identity.
        this.spawnFollowerNear(0, "BRUTE");
        this.spawnSoldierNear(40, "SHIELD", -1).paralyze();
        break;
      }
      case "bruteVsGunner": {
        // Same setup as gunnerBlock, but a Brute (12hp) sits in the lane
        // instead of a base follower — watch it eat several shots and live.
        this.spawnFollowerNear(60, "BRUTE");
        this.spawnSoldierNear(120, "RIFLEMAN", -1);
        break;
      }
      case "callForHelp": {
        const rifleman = this.spawnSoldierNear(150, "RIFLEMAN", -1);
        rifleman.paralyze();
        for (let i = 0; i < 62 && rifleman.state === "PARALYZED"; i++) rifleman.update(0.1);
        // Now RECOVERING (1.2s window). Close enough (60px, well within
        // SOLDIER.speed 70 x 1.2s = 84px max closable) that it actually
        // reaches the Rifleman before the window closes, and still
        // outside Emily's own 320 detect range so it's free to respond.
        this.spawnSoldierNear(210, "STANDARD", -1);
        break;
      }
      case "fusionViaCombat": {
        // 3 existing followers autonomously engage and kill a nearby
        // soldier — the resulting 4th follower triggers auto-fusion live,
        // no pre-spawned followers, no demo shortcut.
        const a = this.spawnFollowerNear(-10);
        const b = this.spawnFollowerNear(-25);
        const c = this.spawnFollowerNear(-40);
        [a, b, c].forEach((f) => (f.hasJoined = true));
        this.spawnSoldierNear(80);
        break;
      }
    }
  }

  /** Read-only snapshot for the test harness (src/debug/tests.ts) — the
   * one sanctioned way to inspect otherwise-private scene state from
   * outside the class, instead of tests reaching into internals directly. */
  getTestSnapshot() {
    return {
      emily: this.emily,
      soldiers: this.soldiers,
      followers: this.followers,
      ammo: this.ammo,
      aggro: this.aggro,
      isGameOver: this.isGameOver,
      isCleared: this.isCleared,
      stuckLimbs: this.stuckLimbs,
      fallingLimbs: this.fallingLimbs,
      groundedLimbs: this.groundedLimbs,
      limbs: this.limbs,
    };
  }

  /** Test/demo support: spawns a limb with an explicit velocity, bypassing
   * the real throw-input path — lets a test drive a specific hit-direction
   * (e.g. a Shield Trooper's frontal deflect) without simulating key input. */
  debugSpawnLimb(x: number, y: number, velX: number): Limb {
    const limb = new Limb(this, x, y, velX >= 0 ? 1 : -1);
    limb.setVelocity(velX, 0);
    this.limbs.push(limb);
    return limb;
  }

  /** Test/demo support: performs Emily's actual throw — same ammo cost,
   * cooldown, and launch velocity a J-press would produce — instead of
   * conjuring a limb with an arbitrary velocity. Use this whenever what's
   * being tested is the throw mechanic itself, not just "a limb arriving
   * from some direction." */
  debugThrowLimb(): void {
    this.throwLimb();
  }
}
