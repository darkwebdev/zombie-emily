import Phaser from "phaser";
import { WORLD, EMILY, EMILY_SPRITE, LIMB, COMBAT, AGGRO, FLANK, FUSION, TRAIL_DEGENERATION_THRESHOLD } from "../config/tuning";
import type { DemoName } from "../debug/demos";
import type { EnemyKind, FollowerKind } from "../config/tuning";
import { Emily } from "../entities/Emily";
import { preloadCharacterArt } from "../entities/characterArt";
import { Soldier } from "../entities/Soldier";
import { Follower } from "../entities/Follower";
import { Limb } from "../entities/Limb";
import { BreadcrumbTrail } from "../systems/BreadcrumbTrail";
import { CombatSystem } from "../systems/CombatSystem";
import { AggroSystem } from "../systems/AggroSystem";
import { GunfireSystem } from "../systems/GunfireSystem";
import { ParallaxBackground } from "../systems/ParallaxBackground";
import { Hud } from "../systems/Hud";
import { pinToScreen } from "../systems/screenPin";
import { touchInput } from "../systems/touchControls";
import { SPAWNS } from "../levels/level1";
import { applyHitboxes } from "../debug/hitboxes";

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

/** Which of Emily's animations a preview demo holds her in. */
type AnimPreview = "idle" | "walk" | "throw";

const ANIM_PREVIEW_BY_DEMO: Record<"animIdle" | "animWalk" | "animThrow", AnimPreview> = {
  animIdle: "idle",
  animWalk: "walk",
  animThrow: "throw",
};

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
  /** Legacy alias for the throw; the real key is ↑ (cursors.up). */
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private throwCooldownRemaining = 0;
  private ammo = LIMB.ammoMax;
  private followerSpawnSeq = 0;

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
  /** Debug-only animation preview state (the anim* demos), null in normal
   * play — see driveAnimPreview. */
  private animPreview: AnimPreview | null = null;
  private animPreviewOriginX = 0;
  private animPreviewDir: 1 | -1 = 1;

  constructor() {
    super("game");
  }

  /** The only loaded assets in the project: Emily's animation sheets and the
   * thrown-arm texture (src/assets, cut by tools/extract_sprites.py).
   * Everything else is still runtime-generated shapes. */
  preload(): void {
    Limb.preload(this);
    Emily.preload(this);
    preloadCharacterArt(this);
    ParallaxBackground.preload(this);
  }

  create(): void {
    this.animPreview = null;
    this.isGameOver = false;
    this.isCleared = false;
    // A direction still held (or an action queued) when the scene restarts
    // would otherwise carry into the fresh run.
    touchInput.reset();
    this.debugMode = new URLSearchParams(location.search).has("debug");
    this.ammo = LIMB.ammoMax;
    this.followerSpawnSeq = 0;
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
    Limb.createMarkerTexture(this);

    this.physics.world.gravity.y = 0;
    this.physics.world.setBounds(0, 0, WORLD.levelWidth, WORLD.height);

    // Draws the street as well as the sky layers, so there's no separate
    // ground object any more.
    this.background = new ParallaxBackground(this);

    this.emily = new Emily(this, 80, WORLD.groundY);

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

    // The canvas is WORLD.zoom times the world size (see main.ts); this is
    // what turns those extra pixels into magnification, so a screenful is
    // still WORLD.width x WORLD.height of world.
    this.cameras.main.setZoom(WORLD.zoom);
    this.cameras.main.setBounds(0, 0, WORLD.levelWidth, WORLD.height);
    // lerpX 1 = no smoothing lag, Emily stays pinned to the horizontal center
    // every frame; lerpY 0 keeps the camera from ever panning vertically,
    // since flat-ground levels never move Emily's y.
    this.cameras.main.startFollow(this.emily, true, 1, 0);
    // Phaser only resolves the follow target and fills in camera.worldView
    // during preRender, i.e. *after* the first update() — so anything that
    // reads worldView on frame 1 (the off-screen entrance in
    // updateSoldierTargeting) would otherwise see an empty rect at 0,0.
    this.cameras.main.preRender();

    // Console/automation access for debugging — same gate as the demo panel.
    if (this.debugMode) {
      (window as unknown as { __scene: GameScene }).__scene = this;
      // Demo buttons restart the scene, which resets drawDebug to its
      // config value — re-apply the panel's toggle so it survives.
      applyHitboxes(this);
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
      if (Phaser.Input.Keyboard.JustDown(this.keyR) || touchInput.consumeRestart()) this.scene.restart();
      return;
    }
    // Drained even when unused, so a restart tap can't be banked and then
    // restart the run at some arbitrary later moment.
    touchInput.consumeRestart();

    this.handleFeed(dt);
    this.handleMovementAndThrow(dt);
    this.emily.tick(dt);

    this.trail.update(dt * 1000, this.emily.x);

    this.aggro.update(dt, this.followers.length);
    const rushPressed = Phaser.Input.Keyboard.JustDown(this.keySpace) || touchInput.consumeRush();
    if (rushPressed) {
      this.aggro.tryActivate(this.followers, this.soldiers);
    }
    this.aggro.resolveRushExits(this.followers);

    // Each follower's fight, resolved before anyone moves: the flank slots
    // below need to know how many followers are converging on a given
    // soldier, and how they're already split across its two sides, which
    // isn't knowable while the same pass is still moving them.
    const engaging = new Map<Follower, Soldier>();
    this.followers.forEach((f) => {
      const target = f.mode === "RUSH" && f.rushTarget ? f.rushTarget : this.findNearestEngageable(f);
      if (target) engaging.set(f, target);
      f.releaseFlankIfNot(target ?? null);
    });

    // Walked in rank order (front to back) so each unit's trail offset can
    // accumulate the trailSpacing of everyone ahead of it — a mixed roster
    // (a tight-spacing Brute up front, wider-spacing base followers behind)
    // can't use a flat rank*spacing formula.
    let trailOffset = 0;
    [...this.followers]
      .sort((a, b) => a.rank - b.rank)
      .forEach((f) => {
        trailOffset += f.stats.trailSpacing;
        const target = engaging.get(f);
        if (target) {
          const slotX = this.flankSlotX(f, target, engaging);
          if (f.mode === "RUSH") f.rushToward(slotX);
          else f.followTarget(slotX);
          // Whichever side it ended up on, it bites the soldier, so it has
          // to look at it — followTarget/rushToward face by direction of
          // travel, which points a follower that crossed to the far side
          // away from the thing it's attacking.
          f.faceToward(target.x);
          f.hasJoined = false; // once this fight ends, wait here rather than snapping back to the trail
          return;
        }
        // A follower waits in place — doesn't chase the trail — until
        // Emily's own position moves past where it's standing.
        if (!f.hasJoined) f.checkJoined(this.emily.x, this.emily.facing);
        if (f.hasJoined) {
          f.followTarget(this.trail.targetXForOffset(trailOffset) + f.xJitter);
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

    this.background.update(this.cameras.main.worldView.x);

    this.hud.update(
      dt,
      this.emily.hp,
      EMILY.maxHp,
      this.aggro.value,
      this.aggro.isFull,
      this.aggro.rejectFlashRemaining,
      this.followers.length,
      this.followers.filter((f) => f.isBrute).length,
      this.ammo,
    );

    if (this.emily.isDead) {
      this.triggerDeath();
      return;
    }
    // An animation preview deliberately spawns an empty level, which would
    // otherwise read as an instant win and freeze the scene on the CLEARED
    // screen before anything could be watched.
    if (
      !this.animPreview &&
      this.soldiers.length === 0 &&
      this.pendingConversions.length === 0 &&
      !this.isCleared
    ) {
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

    // The horde is uncapped on purpose, but the breadcrumb trail can't
    // address more samples than it stores: past this many followers the
    // tail all targets the same oldest sample and piles up at one x.
    // A diagnostic, not a cap — see TRAIL in tuning.ts.
    if (this.followers.length >= TRAIL_DEGENERATION_THRESHOLD) {
      this.debugLabels.push(
        pinToScreen(
          this.add.text(4, 4, `TRAIL SATURATED ${this.followers.length}/${TRAIL_DEGENERATION_THRESHOLD}`, {
            fontSize: "8px",
            color: "#ff6666",
          }),
        ).setDepth(999),
      );
    }
  }

  private handleMovementAndThrow(dt: number): void {
    if (this.animPreview) {
      this.driveAnimPreview();
      return;
    }

    let dir: -1 | 0 | 1 = 0;
    if (this.cursors.left.isDown || touchInput.left) dir = -1;
    else if (this.cursors.right.isDown || touchInput.right) dir = 1;
    this.emily.handleMovement(dir);

    this.throwCooldownRemaining -= dt;
    // consumeThrow() must be called every frame, not short-circuited behind
    // the keyboard check — a queued tap that went unread would otherwise sit
    // there and fire late, on some unrelated later frame.
    const touchThrew = touchInput.consumeThrow();
    const throwPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keyJ) ||
      touchThrew;
    if (
      throwPressed &&
      this.throwCooldownRemaining <= 0 &&
      !this.emily.isFeeding &&
      this.ammo > 0
    ) {
      this.throwLimb();
    }
  }

  /** Debug-only (the anim* demos): holds Emily in one animation state so it
   * can be watched without a key held down. Walking/running is real movement
   * — she paces a window around where the demo dropped her, so the cycle and
   * the turn-around flip are both visible — and the throw preview replays
   * only the animation, without spending ammo or spawning limbs. */
  private driveAnimPreview(): void {
    if (this.animPreview === "idle") {
      this.emily.handleMovement(0);
      return;
    }
    if (this.animPreview === "throw") {
      this.emily.handleMovement(0);
      if (!this.emily.isThrowAnimPlaying) this.emily.playThrow();
      return;
    }
    const half = EMILY_SPRITE.previewPaceHalfWidth;
    if (this.emily.x >= this.animPreviewOriginX + half) this.animPreviewDir = -1;
    else if (this.emily.x <= this.animPreviewOriginX - half) this.animPreviewDir = 1;
    this.emily.handleMovement(this.animPreviewDir, EMILY_SPRITE.previewWalkFraction);
  }

  /** The actual throw action — ammo cost, cooldown, and the limb's real
   * launch velocity (LIMB.throwSpeed/throwLift via Limb's constructor),
   * fired from Emily's current position and facing. The ↑-key handler
   * above and the test API's debugThrowLimb() both funnel through this, so
   * a scripted "throw" is the same throw a player would actually make. */
  private throwLimb(): void {
    this.throwCooldownRemaining = LIMB.throwCooldown;
    this.ammo -= 1;
    this.emily.playThrow();
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

  /** Where a follower should stand to attack `target`, latching it to a side
   * the first time it's one of several attacking the same soldier.
   *
   * The latch is the anti-oscillation guarantee: a side, once taken, is held
   * for as long as the target is the same soldier, so two followers at
   * near-equal distance can't swap places every frame. Sides are picked by
   * whichever currently holds fewer followers, counted live off the
   * followers themselves so a death mid-fight rebalances the next arrival
   * rather than shuffling everyone already in place — and never off `rank`,
   * which shifts when a follower ahead dies.
   *
   * **On a tie, the attacker currently nearest the target is the one that
   * crosses.** Followers arrive in a conga line from Emily's side, so the
   * usual case is that every unlatched attacker is on the *same* side and
   * somebody has to walk through the soldier to reach the other one. Which
   * one does it decides how long the surround takes to form, and the two
   * choices are not equal: with attackers at distances d1 < d2 and standoff
   * `s`, sending the nearest across costs `max(d1 + s, d2 - s)` of travel
   * while sending the farthest costs `d2 + s`, and the first is never larger.
   * Sending the farthest — which is what "tie goes to the side you're already
   * on" produced, because the nearest latches first and claims the near side
   * — serialises the *longest* approach with the crossing on top of it, and
   * measured ~100ms slower to surround a STANDARD (624ms vs 528ms); against a
   * 4hp RIFLEMAN the surround never formed at all before the kill. The cost
   * is that the leader now walks a little further before its first bite
   * (~32ms, measured). A follower already standing on the far side is not
   * asked to cross: the tie-break only fires when every other unlatched
   * attacker is on this follower's own side.
   *
   * Nearest is measured among *unlatched* attackers only — anyone already
   * latched is a fact, not a candidate — and exact ties resolve by iteration
   * order of `engaging`, which is the scene's follower array (spawn order),
   * deliberately not `rank`. Only one follower can ever reach this branch per
   * frame per target anyway: the first to latch makes the side counts uneven
   * for everyone behind it in the same pass.
   *
   * Below FLANK.minEngagers nobody flanks; a lone follower walks at the
   * soldier's centre exactly as before. Crossing the threshold is one-way:
   * a follower that took a side keeps it when its partner dies, because
   * stepping back to centre mid-fight is the same visual pop the latch
   * exists to prevent. */
  private flankSlotX(follower: Follower, target: Soldier, engaging: Map<Follower, Soldier>): number {
    if (follower.flankSide === 0) {
      const ownSide = (Math.sign(follower.x - target.x) || 1) as -1 | 1;
      let attackers = 0;
      let left = 0;
      let right = 0;
      let someoneElseOnFarSide = false;
      let nearestUnlatchedDist = Math.abs(follower.x - target.x);
      let followerIsNearestUnlatched = true;
      engaging.forEach((t, other) => {
        if (t !== target) return;
        attackers++;
        if (other === follower) return;
        if (other.flankSide === -1) {
          left++;
          return;
        }
        if (other.flankSide === 1) {
          right++;
          return;
        }
        // Unlatched peer: a candidate for "who crosses", and evidence about
        // whether the far side is going to be covered by somebody standing
        // there already.
        if ((Math.sign(other.x - target.x) || 1) !== ownSide) someoneElseOnFarSide = true;
        else if (Math.abs(other.x - target.x) < nearestUnlatchedDist) followerIsNearestUnlatched = false;
      });
      if (attackers >= FLANK.minEngagers) {
        const crosses = !someoneElseOnFarSide && followerIsNearestUnlatched;
        follower.flankSide =
          left < right ? -1 : right < left ? 1 : ((crosses ? -ownSide : ownSide) as -1 | 1);
      }
    }

    if (follower.flankSide === 0) return target.x;
    const standoff = follower.stats.flankStandoff + follower.flankJitter;
    return Phaser.Math.Clamp(target.x + follower.flankSide * standoff, 0, WORLD.levelWidth);
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
            // force: a walking soldier always faces where it walks, or the
            // turn commitment would make it moonwalk. See Soldier.faceToward.
            soldier.faceToward(target.x, true);
            soldier.moveToward(target.x);
            continue;
          }

          if (!soldier.respondingToCall) {
            const caller = this.nearestCaller(soldier, callers);
            if (caller) {
              // Entrance: arrives from the right edge of the camera's
              // current view, instead of a soldier that was already
              // standing on screen just starting to walk.
              // worldView, not scrollX: the camera is zoomed (see main.ts),
              // so scrollX is in screen pixels while worldView is the slice
              // of the world actually on screen.
              soldier.setX(this.cameras.main.worldView.right + 20);
              soldier.respondingToCall = true;
              // Head for whatever's actually threatening the caller
              // (almost always Emily, since she's the one who paralyzed
              // it), falling back to the caller's own position only if
              // nothing's close enough to it to identify yet.
              const threat = this.nearestZombieX(caller, caller.stats.detectRadius);
              soldier.faceToward(threat?.x ?? caller.x, true);
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

  /** Removes the soldier and spawns a base follower in its place. The horde
   * is uncapped (docs/PROGRESSION.md §1), so a conversion always produces a
   * follower — never add a headcount check here. Shared by the normal 1.0s
   * CONVERTING delay and demo shortcuts that skip straight to the result. */
  private finishConversion(soldier: Soldier): void {
    this.soldiers = this.soldiers.filter((s) => s !== soldier);
    const rank = this.followers.length;
    this.followers.push(new Follower(this, soldier.x, soldier.y, rank, "BASE", this.nextFollowerSeed()));
    soldier.destroy();
  }

  /** Per-run, per-follower seed for the depth band (see HORDE_SPREAD). Scene
   * state rather than a module static on purpose: every demo button restarts
   * the scene, and a counter that carried across restarts would hand the same
   * scenario different offsets on each run and make the tests unreproducible. */
  private nextFollowerSeed(): number {
    return this.followerSpawnSeq++;
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
      // If any consumed follower had already joined the trail, the Brute
      // inherits that — it's a continuation of already-moving followers,
      // not a fresh spawn that should freeze and wait for Emily again.
      const alreadyJoined = consumed.some((f) => f.hasJoined);

      consumed.forEach((f) => this.removeFollower(f));

      // Canonical ground Y, deliberately not the average of the consumed
      // followers' y — that average already contains their depth offsets, and
      // the Brute is a new figure that gets its own spot in the band.
      const brute = new Follower(this, spawnX, WORLD.groundY, 0, "BRUTE", this.nextFollowerSeed());
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
      const offLevel = limb.x < -20 || limb.x > WORLD.levelWidth + 20;
      if (limb.hasLanded || offLevel) {
        // land() snaps it flat on the ground line, so a miss can't come to
        // rest hanging in the air wherever the physics step left it.
        limb.land();
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
      if (limb.hasLanded) {
        limb.land();
        this.groundedLimbs.push(limb);
        return false;
      }
      return true;
    });
  }

  /** Ammo returns the moment Emily is in contact with a limb that has
   * finished doing its job — never on a passive timer. "Finished" means it
   * isn't still embedded in a paralyzed soldier: a limb holding a soldier
   * down can't be collected, so picking one up can never cut a paralysis
   * short. The instant that paralysis ends (or the soldier converts), the
   * limb is fair game — including while it's still falling, so a limb
   * released by a soldier Emily is already standing on goes straight back to
   * her instead of making her watch it drop and then step onto it again.
   * Reach is horizontal-only — see COMBAT.limbPickupRange for why. */
  private handleLimbPickup(): void {
    const collect = (limb: Limb): boolean => {
      if (!limb.active) return false;
      if (Math.abs(this.emily.x - limb.x) - limb.displayWidth / 2 > COMBAT.limbPickupRange) {
        return true;
      }
      limb.destroy();
      this.ammo = Math.min(LIMB.ammoMax, this.ammo + 1);
      return false;
    };
    this.fallingLimbs = this.fallingLimbs.filter(collect);
    this.groundedLimbs = this.groundedLimbs.filter(collect);
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
    pinToScreen(
      this.add
        .text(WORLD.width / 2, WORLD.height / 2, "CLEARED — press R", {
          fontSize: "16px",
          color: "#ffffff",
        })
        .setOrigin(0.5),
    ).setDepth(1001);
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
    const f = new Follower(this, this.emily.x + offsetX, WORLD.groundY, rank, kind, this.nextFollowerSeed());
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
      // The three anim* demos spawn nothing: an empty stretch of level, so
      // the cycle being previewed is the only thing moving on screen.
      case "animIdle":
      case "animWalk":
      case "animThrow": {
        this.animPreview = ANIM_PREVIEW_BY_DEMO[name];
        this.animPreviewOriginX = this.emily.x;
        this.animPreviewDir = 1;
        break;
      }
      case "artRoster": {
        // Spread wide enough that the wider figures (the Brute especially)
        // don't overlap — the point is to see each silhouette whole. They
        // can't be spread far enough to stop the followers engaging as well:
        // BRUTE.engageRadius is 200 and the whole screen is only 320 wide, so
        // this is a look-then-it-fights line-up, not a frozen one.
        this.spawnSoldierNear(40, "STANDARD");
        this.spawnSoldierNear(80, "SHIELD");
        this.spawnSoldierNear(120, "RIFLEMAN");
        this.spawnFollowerNear(-40, "BASE");
        this.spawnFollowerNear(-90, "BRUTE");
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
      case "limbMiss": {
        // The soldier is only there to stop an empty level reading as an
        // instant win and freezing the scene on CLEARED. At offset 400 it is
        // far outside the ~175px a throw covers before it hits the floor, so
        // the throw is still a guaranteed miss and what's on show is purely
        // where the limb ends up: flat on the ground line, marked, and
        // pick-up-able.
        this.spawnSoldierNear(400);
        this.throwLimb();
        break;
      }
      case "limbAutoPickup": {
        // ACTIVE, not pre-paralyzed: handleLimbHits ignores an
        // already-paralyzed soldier, so a limb thrown at one would sail
        // straight past instead of sticking. Offset 12 is inside
        // COMBAT.contactRange (16), so Emily is touching the limb the whole
        // time it's embedded — which is what makes "not collected yet" a
        // real claim rather than a distance artifact.
        this.spawnSoldierNear(12);
        this.throwLimb();
        break;
      }
      case "limbDrop": {
        // Ammo spent, as it would be after actually throwing the limb
        // that's now stuck in this soldier — so the drop is the only way
        // to get it back, and "picked up by touch" is a real claim to
        // watch (and to test) rather than a no-op on a full quiver.
        this.ammo = 0;
        const s = this.spawnSoldierNear(40);
        s.paralyze();
        const limb = new Limb(this, s.x, s.y - 4, 1);
        limb.markResolved();
        this.stuckLimbs.push({ sprite: limb, soldier: s });
        this.beginConversion(s);
        break;
      }
      case "uncappedHorde": {
        // 4 Brutes was exactly the old HORDE_CAP (8 slots), the point at
        // which a conversion used to be swallowed. Spawned directly as
        // BRUTE so they don't also trigger auto-fusion (that only fires on
        // 4+ BASE followers). They're inside engageRadius of the soldier
        // below, so they close and execute it unprompted — no feed from
        // Emily needed to reach the conversion.
        for (let i = 0; i < 4; i++) this.spawnFollowerNear(-40 - i * 24, "BRUTE");
        this.spawnSoldierNear(40).paralyze();
        break;
      }
      case "hordeFlank": {
        // Two fights at once, because the interesting claim is the contrast.
        //
        // Left: exactly FLANK.minEngagers followers on one soldier, so they
        // split one to each side and the *nearer* one walks through it to
        // reach the far slot. Two rather than four on purpose — four base
        // followers deal 8 damage in their first volley and a 6hp STANDARD
        // would be dead before it could be seen surrounded at all.
        [-10, -25].forEach((dx) => {
          this.spawnFollowerNear(dx).hasJoined = true;
        });
        this.spawnSoldierNear(50);
        // Right: one follower on its own soldier, below the threshold, so it
        // still walks straight at the centre exactly as before. Parked far
        // enough that neither fight is inside the other's engageRadius (140)
        // — 150px apart, so nothing crosses over.
        this.spawnFollowerNear(200).hasJoined = true;
        this.spawnSoldierNear(240);
        break;
      }
      // The four demos below are the same gang-up against the rest of the
      // roster — the surround's behaviour is not one scenario's worth of
      // claim, because how much of it is visible depends entirely on how
      // long the target survives the volley that's converging on it.
      case "flankGunner": {
        // Same geometry as hordeFlank's left-hand fight, so the two read
        // against each other: the only variable is the target's 4hp.
        [-10, -25].forEach((dx) => {
          this.spawnFollowerNear(dx).hasJoined = true;
        });
        this.spawnSoldierNear(50, "RIFLEMAN");
        break;
      }
      case "flankShield": {
        // Paralyzed on purpose: a SHIELD's contactDamage (2) is a base
        // follower's entire hp, so this is the only way a pair of them
        // survives long enough to be seen surrounding anything — and it is
        // also how the enemy is meant to be taken. 9hp under the
        // defenseless multiplier still takes three base bites, which is the
        // longest surround window in the game.
        [-10, -25].forEach((dx) => {
          this.spawnFollowerNear(dx).hasJoined = true;
        });
        this.spawnSoldierNear(50, "SHIELD").paralyze();
        break;
      }
      case "flankShieldActive": {
        // Deliberately the losing version of the demo above — same pair,
        // same distances, no paralyze. Kept as its own scenario because
        // "the horde loses this fight" is an intended balance fact worth
        // failing loudly if anyone quietly retunes it.
        [-10, -25].forEach((dx) => {
          this.spawnFollowerNear(dx).hasJoined = true;
        });
        this.spawnSoldierNear(50, "SHIELD");
        break;
      }
      case "flankBothSides": {
        // One follower on Emily's side, one already past the soldier — the
        // shape the horde ends up in whenever a fight starts after somebody
        // has walked through, which is common after a rush. Nothing here
        // should cross: the assignment rule only sends a follower across
        // when the far side is otherwise uncovered.
        this.spawnFollowerNear(-10).hasJoined = true;
        this.spawnFollowerNear(110).hasJoined = true;
        this.spawnSoldierNear(50, "SHIELD").paralyze();
        break;
      }
      case "flankBrutes": {
        // The toughest enemy in the game (9hp) against the heaviest pair of
        // followers, which is still only two Brute bites.
        [-10, -25].forEach((dx) => {
          this.spawnFollowerNear(dx, "BRUTE").hasJoined = true;
        });
        this.spawnSoldierNear(50, "SHIELD");
        break;
      }
      case "flankMixed": {
        // Base follower nearest, Brute behind it, so the rule has to send
        // the *lighter, faster* unit across — picking by distance rather
        // than by kind or rank. Paralyzed so the base follower isn't
        // one-shot before the two standoffs can be compared.
        this.spawnFollowerNear(-10).hasJoined = true;
        this.spawnFollowerNear(-25, "BRUTE").hasJoined = true;
        this.spawnSoldierNear(50, "SHIELD").paralyze();
        break;
      }
      case "hordeSpread": {
        // Deliberately tighter than trailSpacing would ever leave them: this
        // is the stopped-and-bunched case, which is exactly when they used to
        // merge into one shape.
        // Three BASE at most: a 4th would auto-fuse away (FUSION.requiredBase)
        // and the line-up being looked at would shrink while looking at it.
        for (let i = 0; i < 5; i++) this.spawnFollowerNear(-30 - i * 10, "BRUTE");
        for (let i = 0; i < 3; i++) this.spawnFollowerNear(-80 - i * 8);
        // One soldier, only so the level doesn't read as instantly CLEARED
        // and freeze the scene on the win screen. Parked beyond the nearest
        // follower's engageRadius (BRUTE's 200) so nothing breaks off to
        // fight while the line-up is being looked at.
        this.spawnSoldierNear(260);
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
      backgroundLayers: this.background.debugOffsets,
      cameraWorldX: this.cameras.main.worldView.x,
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
   * cooldown, and launch velocity an ↑-press would produce — instead of
   * conjuring a limb with an arbitrary velocity. Use this whenever what's
   * being tested is the throw mechanic itself, not just "a limb arriving
   * from some direction." */
  debugThrowLimb(): void {
    this.throwLimb();
  }
}
