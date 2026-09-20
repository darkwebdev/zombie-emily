import Phaser from "phaser";
import { BACKGROUND, BRUTE, CHARACTER_ART, COMBAT, EMILY, FLANK, EMILY_SPRITE, FOLLOWER, GROUND_LINE, HORDE_SPREAD, HUD, LIMB, RIFLEMAN, SHIELD_TROOPER, SOLDIER, WORLD } from "../config/tuning";
import { EMILY_ANIM } from "../entities/Emily";
import { SPAWNS } from "../levels/level1";
import { touchInput } from "../systems/touchControls";
import { SCREEN_PIN_OFFSET } from "../systems/screenPin";
import type { DemoName } from "./demos";
import type { Follower } from "../entities/Follower";
import type { Soldier } from "../entities/Soldier";
import type { GameScene } from "../scenes/GameScene";

/** One concrete, named fact checked during a test — rendered as its own
 * line in the debug panel so it's visible exactly what a scenario proved,
 * not just whether the test as a whole passed. */
export interface Check {
  label: string;
  pass: boolean;
  detail?: string;
}

/** A point in time (real ms after the previous checkpoint, or after run()
 * for the first one) where some checks become meaningful to evaluate.
 * Splitting a test into checkpoints lets a scenario with multiple stages
 * (e.g. RECOVERING at the start, ACTIVE later) report each fact exactly
 * when it becomes true on screen, instead of bundling every fact into one
 * assertion fired only at the very end. */
export interface Checkpoint {
  afterMs: number;
  assert: (scene: GameScene) => Check[];
}

export interface TestCase {
  demo: DemoName;
  name: string;
  /** Extra actions to run once, right after the demo's own setup and
   * before the first checkpoint — e.g. simulating a Space press or
   * spawning a limb with a specific velocity. */
  run?: (scene: GameScene) => void;
  checkpoints: Checkpoint[];
}

/** Most tests only need one checkpoint at the end of their settle window —
 * this is that common case, `steps` frames (at 16ms each) after run(). */
function single(steps: number, assert: (scene: GameScene) => Check[]): Checkpoint[] {
  return [{ afterMs: steps * 16, assert }];
}

/** Everything the surround tests record, sampled once per frame.
 *
 * Every one of these facts is transient: a surround only exists while the
 * target is alive, and the fights it exists in last a few hundred ms. A
 * checkpoint can only see where things ended up — by which time the soldier
 * is usually dead and the followers have released their sides — so anything
 * about "was it ever true" or "how long did it take" has to be accumulated
 * frame by frame instead. (docs/TESTING.md, "if the thing you're asserting is
 * transient, sample every frame".) */
interface FlankObs {
  /** Most followers seen engaging the watched target at once. */
  attackersSeen: number;
  /** Attackers stood on both sides of the target at least once while alive. */
  everSurrounded: boolean;
  /** ...and every one of them was inside its own kind's bite reach. */
  everSurroundedInRange: boolean;
  /** When that first happened — so a test can say how long the surround was
   * actually on screen for, rather than only that it happened at all. */
  surroundedInRangeMs: number | null;
  /** ...and the last moment it still held. `until - surroundedInRangeMs` is
   * the surround's real on-screen duration, which is what a demo is judged
   * on — deliberately not "time from surround to the target's death", since
   * that reads as zero whenever the target outlives the checkpoint. */
  surroundedInRangeUntilMs: number | null;
  /** ...and every one of them was facing inward at the target. */
  everFacedInward: boolean;
  firstBiteMs: number | null;
  killMs: number | null;
  /** Per watched follower, the closest it ever got to the flank slot its own
   * kind and latched side put it at — the check that a follower actually
   * parks where the surround says it should, rather than merely ending up on
   * the correct side of the target by drifting through it. */
  minSlotGap: number[];
  /** Per watched follower, how far it got from where it started toward that
   * slot, 0..1. The honest measure for fights that end mid-crossing. */
  crossProgress: number[];
  /** Per watched follower, whether it was still alive at the last sample. */
  survived: boolean[];
  /** The watched followers, in the order the scene held them at install. */
  watched: Follower[];
}

/** Installs the per-frame sampler above for one soldier, and stashes the
 * result on the scene so checkpoints can read it back. Call from a test's
 * `run` hook, which fires after the demo's own setup. */
function watchFlank(scene: GameScene, target: Soldier): FlankObs {
  const watched = [...scene.getTestSnapshot().followers];
  const obs: FlankObs = {
    attackersSeen: 0,
    everSurrounded: false,
    everSurroundedInRange: false,
    surroundedInRangeMs: null,
    surroundedInRangeUntilMs: null,
    everFacedInward: false,
    firstBiteMs: null,
    killMs: null,
    minSlotGap: watched.map(() => Infinity),
    crossProgress: watched.map(() => 0),
    survived: watched.map(() => true),
    watched,
  };
  const startX = watched.map((f) => f.x);
  const startHp = target.hp;
  const t0 = scene.time.now;
  // The slot a follower is steering at, rebuilt from tuning exactly as
  // GameScene.flankSlotX does — per kind, so a Brute is never checked
  // against a base follower's standoff.
  const slotX = (f: Follower) => target.x + f.flankSide * (f.stats.flankStandoff + f.flankJitter);
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
    const ms = scene.time.now - t0;
    const alive = target.active && target.hp > 0;
    const live = scene.getTestSnapshot().followers;
    watched.forEach((f, i) => {
      obs.survived[i] = live.includes(f);
    });
    if (!alive) {
      if (obs.killMs === null) obs.killMs = ms;
      return;
    }
    if (target.hp < startHp && obs.firstBiteMs === null) obs.firstBiteMs = ms;
    const on = live.filter((f) => f.flankTarget === target);
    obs.attackersSeen = Math.max(obs.attackersSeen, on.length);
    on.forEach((f) => {
      const i = watched.indexOf(f);
      if (i < 0 || f.flankSide === 0) return;
      const gap = Math.abs(f.x - slotX(f));
      obs.minSlotGap[i] = Math.min(obs.minSlotGap[i], gap);
      const total = Math.abs(startX[i] - slotX(f));
      obs.crossProgress[i] = Math.max(obs.crossProgress[i], total === 0 ? 1 : 1 - gap / total);
    });
    if (on.some((f) => f.x < target.x) && on.some((f) => f.x > target.x)) {
      obs.everSurrounded = true;
      const inRange = on.every(
        (f) =>
          Phaser.Math.Distance.Between(f.x, f.y, target.x, target.y) <=
          Math.max(COMBAT.contactRange, f.stats.reach),
      );
      if (inRange) {
        obs.everSurroundedInRange = true;
        if (obs.surroundedInRangeMs === null) obs.surroundedInRangeMs = ms;
        obs.surroundedInRangeUntilMs = ms;
      }
      if (on.every((f) => f.flipX === f.x > target.x)) obs.everFacedInward = true;
    }
  });
  (scene as unknown as { __flankObs?: FlankObs }).__flankObs = obs;
  return obs;
}

function readFlank(scene: GameScene): FlankObs {
  return (scene as unknown as { __flankObs: FlankObs }).__flankObs;
}

/** The side-assignment claims, all of which are settled on the very first
 * frame both followers see the same target — long before anyone has walked
 * anywhere. Asserting them from the latch rather than from where bodies
 * ended up is what proves the *rule*, and it's the only part of a surround
 * that's checkable against a target that dies in half a second.
 *
 * `nearestIsFirst` says which of the two spawned followers is the one
 * standing closer to the target, so the test states its own expectation
 * rather than deriving it from the thing under test. */
function assignmentChecks(scene: GameScene, target: Soldier): Check[] {
  const on = scene.getTestSnapshot().followers.filter((f) => f.flankTarget === target);
  const sides = on.map((f) => f.flankSide).sort();
  const byDistance = [...on].sort(
    (a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x),
  );
  const nearest = byDistance[0];
  const ownSide = nearest ? Math.sign(nearest.x - target.x) || 1 : 0;
  return [
    {
      label: `All ${FLANK.minEngagers} followers picked up the same target`,
      pass: on.length === FLANK.minEngagers,
      detail: `attackers=${on.length}`,
    },
    {
      // Both spawn on Emily's side, so "whichever side has fewer" is the
      // only thing that can split them — a nearest-side rule would put both
      // on the near one and never surround anything.
      label: "They split one to each side rather than both taking the near one",
      pass: sides.length === 2 && sides[0] === -1 && sides[1] === 1,
      detail: `sides=${sides.join(",")}`,
    },
    {
      // The rule this repo picked over "tie goes to the side you're already
      // on": sending the nearest across costs max(d1+s, d2-s) of travel,
      // sending the farthest costs d2+s, and the first is never larger. The
      // old rule always produced the second, because the nearest latched
      // first and claimed the near side.
      label: "The follower standing NEAREST is the one sent across to the far side",
      pass: !!nearest && nearest.flankSide === -ownSide,
      detail: `nearest kind=${nearest?.kind} ownSide=${ownSide} side=${nearest?.flankSide}`,
    },
  ];
}

/** At least one test per demo in demos.ts — each drives that exact scenario
 * and checks several concrete, behavioral facts, not just a single combined
 * boolean. A few demos carry two tests, because proving a second claim needs
 * a different starting setup (e.g. a limb thrown at the same soldier can
 * either be watched recovering OR be re-paralyzed, not both in one run). */
export const TESTS: TestCase[] = [
  {
    demo: "animIdle",
    name: "Idle preview: she stands still and loops the idle cycle",
    checkpoints: single(20, (scene) => {
      const emily = scene.getTestSnapshot().emily;
      const body = emily.body as Phaser.Physics.Arcade.Body;
      return [
        { label: "Standing still", pass: body.velocity.x === 0, detail: `vx=${body.velocity.x}` },
        {
          label: "Idle cycle playing",
          pass: emily.anims.currentAnim?.key === EMILY_ANIM.idle && emily.anims.isPlaying,
          detail: `anim=${emily.anims.currentAnim?.key} playing=${emily.anims.isPlaying}`,
        },
        {
          // An empty level is an instant win everywhere else — the preview
          // has to suppress that or there'd be nothing to watch.
          label: "Empty level doesn't end the preview as CLEARED",
          pass: !scene.getTestSnapshot().isCleared,
          detail: `cleared=${scene.getTestSnapshot().isCleared}`,
        },
      ];
    }),
  },
  {
    demo: "animWalk",
    name: "Walk preview: real arrow-key speed, walk cycle, and she turns inside the pacing window",
    checkpoints: [
      {
        afterMs: 320,
        assert: (scene) => {
          const emily = scene.getTestSnapshot().emily;
          const body = emily.body as Phaser.Physics.Arcade.Body;
          const want = EMILY.speed * EMILY_SPRITE.previewWalkFraction;
          return [
            {
              // The preview drives her at exactly EMILY.speed, same as an
              // arrow key, so this is the guard on arrow-key movement being
              // a walk and nothing else.
              label: `Moving at ${Math.round(want)}px/s, her real arrow-key speed`,
              pass: Math.abs(Math.abs(body.velocity.x) - want) < 1,
              detail: `vx=${body.velocity.x}`,
            },
            {
              label: "Walk cycle playing",
              pass: emily.anims.currentAnim?.key === EMILY_ANIM.walk && emily.anims.isPlaying,
              detail: `anim=${emily.anims.currentAnim?.key}`,
            },
            {
              // The walk sheet is the one animation cut from its own grid
              // sheet rather than the character board, so it's the one whose
              // frame count can silently change when the art is re-exported.
              // Compared against the loaded texture, not a literal, so
              // re-authoring the cycle at a different length stays a
              // one-file change.
              label: "Walk cycle plays every frame in the sheet",
              pass: emily.anims.currentAnim?.frames.length === scene.textures.get("emily-walk").frameTotal - 1,
              detail: `anim=${emily.anims.currentAnim?.frames.length} sheet=${scene.textures.get("emily-walk").frameTotal - 1}`,
            },
            { label: "Heading right, sprite unflipped", pass: emily.facing === 1 && !emily.flipX, detail: `facing=${emily.facing} flipX=${emily.flipX}` },
          ];
        },
      },
      {
        // previewPaceHalfWidth (100px) at EMILY.speed (95px/s) is a bit over
        // 1s out, so by now she has hit the edge of the window and turned.
        afterMs: 1500,
        assert: (scene) => {
          const emily = scene.getTestSnapshot().emily;
          return [
            {
              label: "Turned around at the edge of the pacing window",
              pass: emily.facing === -1,
              detail: `facing=${emily.facing} x=${Math.round(emily.x)}`,
            },
            { label: "Turning flips the sprite", pass: emily.flipX === true, detail: `flipX=${emily.flipX}` },
            {
              label: "Still walking after the turn",
              pass: emily.anims.currentAnim?.key === EMILY_ANIM.walk && emily.anims.isPlaying,
              detail: `anim=${emily.anims.currentAnim?.key}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "artLayers",
    name: "Runtime layers stay glued to the character they're drawn over",
    checkpoints: single(20, (scene) => {
      // Every accessor here is null-safe on purpose. The demo panel calls
      // assert() once up front, before the scenario's own soldiers exist, to
      // lay out the row labels — so an assert that dereferences a specific
      // soldier throws, kills the run, and the scenario renders with no
      // checks at all rather than failing ones.
      const { soldiers } = scene.getTestSnapshot();
      const facingRight = soldiers[0];
      const flipped = soldiers[1];
      const tinted = soldiers[2];
      // The demo appends its placeholder band with addLayer(), so it is the
      // LAST sprite in the stack — not the first. Index 0 is now whatever the
      // manifest puts at the bottom of the gear (legs), which is an anchored
      // layer with its own origin and scale by design.
      const badge = (s?: (typeof soldiers)[number]) =>
        s?.layers?.layerSprites[s.layers.layerSprites.length - 1];

      const checks: Check[] = [
        {
          label: "All three soldiers carry a stack of overlay layers",
          pass: soldiers.length === 3 && soldiers.every((s) => s.layers.isLayered),
          detail: `count=${soldiers.length} layered=[${soldiers.map((s) => s.layers.isLayered)}]`,
        },
        {
          // The manifest gear plus the demo's own added band. If addLayer
          // stopped appending, this is what notices.
          label: "addLayer appended on top of the manifest gear",
          pass: (facingRight?.layers.layerSprites.length ?? 0) > 1,
          detail: `layers=${facingRight?.layers.layerSprites.length}`,
        },
      ];

      for (const s of soldiers) {
        const o = badge(s);
        checks.push({
          // The added band carries no anchor, so it uses the pre-aligned path
          // and must sit exactly on the body it belongs to.
          label: `${s.state}: added layer sits exactly on its body`,
          pass: !!o && o.x === s.x && o.y === s.y,
          detail: `overlay=(${o?.x},${o?.y}) body=(${s.x},${s.y})`,
        });
        checks.push({
          label: `${s.state}: added layer shares the body's origin and scale`,
          pass: !!o && o.originY === s.originY && o.scaleY === s.scaleY,
          detail: `originY ${o?.originY} vs ${s.originY}, scaleY ${o?.scaleY} vs ${s.scaleY}`,
        });
        checks.push({
          // Every layer must stay inside its own character's slice of the
          // depth sort, or gear would render behind the figure wearing it.
          label: `${s.state}: every layer draws just above its own body`,
          pass:
            s.layers.layerSprites.length > 0 &&
            s.layers.layerSprites.every((l) => l.depth > s.depth && l.depth - s.depth < 1e-4),
          detail: `body=${s.depth} layers=[${s.layers.layerSprites.map((l) => l.depth)}]`,
        });
      }

      checks.push({
        label: "Layers mirror the body's facing (one right, one flipped)",
        pass:
          !!facingRight &&
          !!flipped &&
          facingRight.layers.layerSprites.every((l) => l.flipX === facingRight.flipX) &&
          flipped.layers.layerSprites.every((l) => l.flipX === flipped.flipX) &&
          facingRight.flipX !== flipped.flipX,
        detail: `right=${facingRight?.flipX} flipped=${flipped?.flipX}`,
      });

      checks.push({
        // The one that would ship looking merely "a bit off": state tints are
        // how a soldier is read, so a green body under untinted gear
        // misreports paralysis.
        label: "Paralyze tint reaches every layer, not just the body",
        pass:
          !!tinted &&
          tinted.isTinted &&
          tinted.layers.layerSprites.length > 0 &&
          tinted.layers.layerSprites.every((l) => l.isTinted && l.tintTopLeft === tinted.tintTopLeft),
        detail: `body=${tinted?.tintTopLeft?.toString(16)} layers=[${tinted?.layers.layerSprites.map((l) => l.tintTopLeft?.toString(16))}]`,
      });

      checks.push({
        // Contrast case, or the check above would pass on a stack that simply
        // tinted everything unconditionally.
        label: "An untinted soldier's layers are untinted too",
        pass:
          !!facingRight &&
          !facingRight.isTinted &&
          facingRight.layers.layerSprites.every((l) => !l.isTinted),
        detail: `body=${facingRight?.isTinted}`,
      });

      return checks;
    }),
  },
  {
    demo: "artRoster",
    name: "Enemy/follower art: feet on the ground line, hitboxes untouched",
    checkpoints: single(20, (scene) => {
      const { soldiers, followers } = scene.getTestSnapshot();
      const roster = [...soldiers, ...followers];
      const checks: Check[] = [
        {
          label: "One of every enemy and follower kind is on screen",
          pass: new Set(roster.map((e) => e.kind)).size === 5,
          detail: roster.map((e) => e.kind).join(","),
        },
      ];
      for (const entity of roster) {
        const body = entity.body as Phaser.Physics.Arcade.Body;
        const box = CHARACTER_ART.hitbox[entity.kind];
        // Followers stand on their own line within the depth band; soldiers
        // are always on the canonical one (offset 0).
        const groundLine = GROUND_LINE + ("depthOffset" in entity ? entity.depthOffset : 0);
        // The figures are all different sizes and none of them is the size of
        // its hitbox, so both of these would break silently the moment the
        // art is re-exported at a different height or a kind is added without
        // a hitbox entry: the sprite would either float/sink or quietly start
        // fighting with a box the size of its silhouette.
        checks.push({
          label: `${entity.kind}: feet on its own ground line`,
          pass: Math.abs(entity.y + (1 - entity.originY) * entity.displayHeight - groundLine) < 0.5,
          detail: `bottom=${(entity.y + (1 - entity.originY) * entity.displayHeight).toFixed(1)} groundLine=${groundLine}`,
        });
        checks.push({
          label: `${entity.kind}: hitbox is still ${box.width}x${box.height}, bottom-centred on it`,
          pass:
            // body.width/height read back in world units: setSize takes
            // source-texture pixels, but Arcade stores them scaled.
            Math.abs(body.width - box.width) < 0.01 &&
            Math.abs(body.height - box.height) < 0.01 &&
            Math.abs(body.x + body.width / 2 - entity.x) < 0.5 &&
            Math.abs(body.y + body.height - groundLine) < 0.5,
          detail: `w=${body.width.toFixed(1)} h=${body.height.toFixed(1)} cx=${(body.x + body.width / 2).toFixed(1)} x=${entity.x.toFixed(1)} bottom=${(body.y + body.height).toFixed(1)} groundLine=${groundLine}`,
        });
      }
      return checks;
    }),
  },
  {
    demo: "animThrow",
    name: "Throw preview: loops the throw without spending ammo",
    checkpoints: [
      {
        afterMs: 48,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          return [
            {
              label: "Throw animation playing",
              pass: s.emily.anims.currentAnim?.key === EMILY_ANIM.throw && s.emily.anims.isPlaying,
              detail: `anim=${s.emily.anims.currentAnim?.key}`,
            },
            { label: `Ammo untouched (${LIMB.ammoMax})`, pass: s.ammo === LIMB.ammoMax, detail: `got ${s.ammo}` },
          ];
        },
      },
      {
        // The throw is a one-shot: by 600ms a single play is long over, so
        // this only passes if the preview is genuinely replaying it. The
        // "reset" test asserts the opposite — that a real throw hands back
        // to idle — so the two together pin down both behaviors.
        afterMs: 600,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          return [
            {
              label: "Still looping the throw, not settled into idle",
              pass: s.emily.anims.currentAnim?.key === EMILY_ANIM.throw && s.emily.anims.isPlaying,
              detail: `anim=${s.emily.anims.currentAnim?.key}`,
            },
            {
              label: "Cosmetic only — no limb was ever spawned",
              pass: s.limbs.length + s.stuckLimbs.length + s.fallingLimbs.length + s.groundedLimbs.length === 0,
              detail: `flying=${s.limbs.length} grounded=${s.groundedLimbs.length}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "reset",
    // Emily is drawn from 40x40 animation frames but fights with a 14x28 box
    // at the ground line. Every number that keeps those two in agreement
    // (EMILY_SPRITE.originY and the body offsets) is invisible on a type
    // check and easy to break while retouching the art, so assert it.
    name: "Emily's animation never moves her hitbox",
    run: (scene) => {
      scene.getTestSnapshot().emily.facing = -1;
      scene.debugThrowLimb();
    },
    checkpoints: [
      {
        afterMs: 48,
        assert: (scene) => {
          const emily = scene.getTestSnapshot().emily;
          const body = emily.body as Phaser.Physics.Arcade.Body;
          const feet = WORLD.groundY + EMILY_SPRITE.bodyHeight / 2;
          return [
            {
              label: `Hitbox still ${EMILY_SPRITE.bodyWidth}x${EMILY_SPRITE.bodyHeight}`,
              pass: body.width === EMILY_SPRITE.bodyWidth && body.height === EMILY_SPRITE.bodyHeight,
              detail: `got ${body.width}x${body.height}`,
            },
            {
              label: `Feet on the ground line (y=${feet})`,
              pass: Math.abs(body.bottom - feet) < 0.001,
              detail: `body.bottom=${body.bottom}`,
            },
            {
              label: "Throwing plays the throw animation",
              pass: emily.anims.currentAnim?.key === EMILY_ANIM.throw && emily.anims.isPlaying,
              detail: `anim=${emily.anims.currentAnim?.key} playing=${emily.anims.isPlaying}`,
            },
            { label: "Facing left flips the sprite", pass: emily.flipX === true, detail: `flipX=${emily.flipX}` },
          ];
        },
      },
      {
        // The throw is 4 frames at EMILY_SPRITE.throwFps — a one-shot, so it
        // has to hand control back rather than freezing on its last frame.
        afterMs: 600,
        assert: (scene) => {
          const emily = scene.getTestSnapshot().emily;
          const body = emily.body as Phaser.Physics.Arcade.Body;
          return [
            {
              label: "Standing still returns to idle once the throw ends",
              pass: emily.anims.currentAnim?.key === EMILY_ANIM.idle && emily.anims.isPlaying,
              detail: `anim=${emily.anims.currentAnim?.key} playing=${emily.anims.isPlaying}`,
            },
            {
              label: "Hitbox unmoved after the animation swap",
              pass: Math.abs(body.bottom - (WORLD.groundY + EMILY_SPRITE.bodyHeight / 2)) < 0.001,
              detail: `body.bottom=${body.bottom}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "reset",
    name: "On-screen touch controls drive Emily like the keyboard does",
    // The touch overlay is DOM, so it can't be tapped from here — but the
    // state it writes is the same state GameScene reads, and that wiring is
    // the part that can actually break. Driving it directly proves the path
    // from a button press to Emily moving, without simulating a finger.
    run: (scene) => {
      void scene;
      touchInput.__setForTest({ right: true });
    },
    checkpoints: [
      {
        afterMs: 3 * 16,
        assert: (scene) => {
          const body = scene.getTestSnapshot().emily.body as Phaser.Physics.Arcade.Body;
          const checks = [
            {
              // Asserting velocity rather than x: a position check would also
              // pass on a single stray frame of drift, while velocity is the
              // thing handleMovement actually sets from the input.
              label: "Held touch-right moves Emily right at full speed",
              pass: body.velocity.x === EMILY.speed,
              detail: `vel=${body.velocity.x} expected=${EMILY.speed}`,
            },
          ];
          // Release for the next checkpoint — a held button whose finger slid
          // off has to actually stop her, not leave her walking forever.
          touchInput.__setForTest({ right: false });
          return checks;
        },
      },
      {
        afterMs: 3 * 16,
        assert: (scene) => {
          const body = scene.getTestSnapshot().emily.body as Phaser.Physics.Arcade.Body;
          return [
            { label: "Releasing it stops her", pass: body.velocity.x === 0, detail: `vel=${body.velocity.x}` },
          ];
        },
      },
    ],
  },
  {
    demo: "reset",
    name: "Reset boots the full level cleanly",
    checkpoints: single(1, (scene) => {
      const s = scene.getTestSnapshot();
      return [
        { label: `All ${SPAWNS.length} level spawns placed`, pass: s.soldiers.length === SPAWNS.length, detail: `got ${s.soldiers.length}` },
        {
          // A bare count would pass just as happily on ten of the wrong
          // enemy in the wrong places — check what actually landed where.
          label: "Each spawn is the authored kind at the authored x",
          pass: s.soldiers.every((sol, i) => sol.kind === SPAWNS[i].kind && sol.x === SPAWNS[i].x),
          detail: `got [${s.soldiers.map((sol) => `${sol.kind}@${sol.x}`)}]`,
        },
        { label: "0 followers", pass: s.followers.length === 0, detail: `got ${s.followers.length}` },
        { label: `Emily at full HP (${EMILY.maxHp})`, pass: s.emily.hp === EMILY.maxHp, detail: `got ${s.emily.hp}` },
        { label: `Ammo full (${LIMB.ammoMax})`, pass: s.ammo === LIMB.ammoMax, detail: `got ${s.ammo}` },
        {
          // Restarting has to clear the previous scenario's leftovers, not
          // lay a fresh level on top of them.
          label: "No limbs left over from the previous scenario",
          pass: s.limbs.length + s.stuckLimbs.length + s.fallingLimbs.length + s.groundedLimbs.length === 0,
          detail: `flying=${s.limbs.length} stuck=${s.stuckLimbs.length} falling=${s.fallingLimbs.length} grounded=${s.groundedLimbs.length}`,
        },
        {
          label: "Neither game-over nor cleared",
          pass: !s.isGameOver && !s.isCleared,
          detail: `gameOver=${s.isGameOver} cleared=${s.isCleared}`,
        },
      ];
    }),
  },
  {
    demo: "reset",
    // The parallax rates are invisible to everything but the eye, and they
    // have silently broken once already: camera.scrollX is in *screen*
    // pixels once the camera is zoomed, so feeding it to the layers scrolled
    // every one of them 3x too fast. Nothing failed, nothing threw — the
    // background was just wrong. Moving Emily well down the level is what
    // makes the camera scroll at all; at spawn it is clamped to the level's
    // left edge and every offset is 0, which any broken formula also passes.
    name: "Background layers scroll at their own rates, in world units",
    run: (scene) => scene.getTestSnapshot().emily.setX(WORLD.levelWidth / 2),
    checkpoints: single(5, (scene) => {
      const s = scene.getTestSnapshot();
      const ground = s.backgroundLayers.find((l) => l.key === "bg-ground");
      return [
        {
          label: `Camera actually scrolled (needed for the rest to mean anything)`,
          pass: s.cameraWorldX > WORLD.width,
          detail: `worldView.x=${Math.round(s.cameraWorldX)}`,
        },
        {
          // tilePositionX is in texture pixels and Phaser shifts the tile by
          // tilePositionX * tileScale, hence the artScale factor.
          label: "Every layer is offset by its own parallax rate",
          pass: s.backgroundLayers.every(
            (l) => Math.abs(l.tilePositionX - s.cameraWorldX * l.parallax * l.artScale) < 0.01,
          ),
          detail: s.backgroundLayers
            .map((l) => `${l.key}=${Math.round(l.tilePositionX)}/${Math.round(s.cameraWorldX * l.parallax * l.artScale)}`)
            .join(" "),
        },
        {
          // The street is the one layer that must NOT drift: it stands in
          // for solid ground, so anything other than 1:1 makes Emily look
          // like she's walking on a treadmill.
          label: "The street tracks the camera exactly (parallax 1)",
          pass: ground?.parallax === 1,
          detail: `parallax=${ground?.parallax}`,
        },
        {
          label: "No two layers share a rate (they'd be one flat layer)",
          pass: new Set(s.backgroundLayers.map((l) => l.parallax)).size === s.backgroundLayers.length,
          detail: `rates=[${s.backgroundLayers.map((l) => l.parallax)}]`,
        },
      ];
    }),
  },
  {
    demo: "paralyze",
    name: "Paralyze sets the soldier to PARALYZED",
    // Emily is spawned within contact range (see applyDemo) — held for
    // 70 frames (~1.1s), past SOLDIER.contactCooldown (1.0s), so this
    // actually proves the soldier stays harmless across a full cooldown
    // cycle, not just that the very first frame hasn't fired yet.
    checkpoints: single(70, (scene) => {
      const s = scene.getTestSnapshot();
      const soldier = s.soldiers[0];
      return [
        { label: "State is PARALYZED", pass: soldier?.state === "PARALYZED", detail: `got ${soldier?.state}` },
        {
          label: "Paralyzing itself doesn't damage the soldier",
          pass: soldier?.hp === SOLDIER.hp,
          detail: `hp ${soldier?.hp}/${SOLDIER.hp}`,
        },
        {
          label: "Can't hit Emily back while paralyzed",
          pass: s.emily.hp === EMILY.maxHp,
          detail: `hp ${s.emily.hp}/${EMILY.maxHp}`,
        },
      ];
    }),
  },
  {
    demo: "recovering",
    name: "Recovering soldier auto-transitions back to ACTIVE",
    checkpoints: [
      {
        // The demo's own setup already fast-forwarded past PARALYZED — this
        // just confirms it landed where the demo promises, right away.
        afterMs: 16,
        assert: (scene) => {
          const soldier = scene.getTestSnapshot().soldiers[0];
          return [{ label: "Starts RECOVERING", pass: soldier?.state === "RECOVERING", detail: `got ${soldier?.state}` }];
        },
      },
      {
        // 1.2s recoveringDuration + margin, measured from the checkpoint
        // above — reported only once it's actually true on screen.
        afterMs: 89 * 16,
        assert: (scene) => {
          const soldier = scene.getTestSnapshot().soldiers[0];
          return [{ label: "Auto-resolves to ACTIVE", pass: soldier?.state === "ACTIVE", detail: `got ${soldier?.state}` }];
        },
      },
    ],
  },
  {
    demo: "recovering",
    name: "A limb hit during RECOVERING re-paralyzes it",
    // A real throw (ammo cost, real launch velocity), not a debug-spawned
    // limb with an arbitrary velocity — proves the actual throw mechanic
    // lands the hit, not just that "some limb touching the soldier"
    // re-paralyzes it. Emily's within the soldier's 40px, facing it by
    // default, so this lands within a couple of frames — far inside the
    // 1.2s recovering window, so the state it finds the soldier in is
    // unambiguously RECOVERING (the test above proves that's where the
    // demo starts) — and the re-hit stops it from ever reaching ACTIVE,
    // which is why this can't share that test's run.
    run: (scene) => {
      scene.debugThrowLimb();
    },
    checkpoints: single(10, (scene) => {
      const s = scene.getTestSnapshot();
      const soldier = s.soldiers[0];
      return [
        { label: "Re-paralyzed, not left recovering", pass: soldier?.state === "PARALYZED", detail: `got ${soldier?.state}` },
        { label: "The limb sticks in it", pass: s.stuckLimbs.length === 1, detail: `stuck=${s.stuckLimbs.length}` },
        {
          // A real throw costs ammo — if this test's limb were still the
          // old debug-spawned kind, ammo would be untouched.
          label: "Ammo actually spent on the throw",
          pass: s.ammo === LIMB.ammoMax - 1,
          detail: `ammo=${s.ammo}/${LIMB.ammoMax}`,
        },
      ];
    }),
  },
  {
    demo: "feed",
    name: "Feed auto-converts a touching paralyzed soldier",
    checkpoints: [
      {
        // ~1.0s in: halfway through EMILY.feedTime (2.0s). The soldier has
        // to still be standing there, or the "2s cost for a free
        // conversion" tradeoff isn't actually being charged.
        afterMs: 60 * 16,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const soldier = s.soldiers[0];
          return [
            { label: "Feeding starts automatically on touch", pass: s.emily.isFeeding === true, detail: `isFeeding=${s.emily.isFeeding}` },
            { label: "Still mid-feed at 1.0s, not an instant convert", pass: soldier?.state === "PARALYZED", detail: `got ${soldier?.state}` },
          ];
        },
      },
      {
        afterMs: 140 * 16, // rest of the 2.0s feed + 1.0s convert + margin
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          return [
            { label: "Soldier consumed", pass: s.soldiers.length === 0, detail: `soldiers=${s.soldiers.length}` },
            { label: "Exactly 1 follower gained", pass: s.followers.length === 1, detail: `followers=${s.followers.length}` },
            { label: "New follower is BASE kind", pass: s.followers[0]?.kind === "BASE", detail: `kind=${s.followers[0]?.kind}` },
          ];
        },
      },
    ],
  },
  {
    demo: "defenseless",
    name: "Defenseless: one bite on a paralyzed target deals 2x damage",
    checkpoints: single(10, (scene) => {
      // ~160ms — the first bite lands almost immediately (cooldown starts at 0)
      const s = scene.getTestSnapshot();
      const soldier = s.soldiers[0];
      const follower = s.followers[0];
      // STANDARD hp 6, one bite at (2 dmg x 2 defenseless) = 4 -> 2 left
      return [
        { label: "One bite deals 2x damage (6hp -> 2hp)", pass: soldier?.hp === 2, detail: `got ${soldier?.hp}` },
        { label: "Soldier still PARALYZED, not dead yet", pass: soldier?.state === "PARALYZED", detail: `got ${soldier?.state}` },
        {
          // Both are spawned on the same x, so the soldier is well inside
          // contact range of the biter — if paralysis didn't suppress its
          // contact damage, this 2hp follower would be taking hits.
          label: "Paralyzed target never bites back",
          pass: follower?.hp === FOLLOWER.hp,
          detail: `hp ${follower?.hp}/${FOLLOWER.hp}`,
        },
      ];
    }),
  },
  {
    demo: "aggroReady",
    name: "Aggro burst sends all followers into RUSH",
    run: (scene) => {
      const s = scene.getTestSnapshot();
      s.aggro.tryActivate(s.followers, s.soldiers);
    },
    checkpoints: single(3, (scene) => {
      const s = scene.getTestSnapshot();
      const soldier = s.soldiers[0];
      return [
        { label: "Both followers still present", pass: s.followers.length === 2, detail: `followers=${s.followers.length}` },
        {
          label: "All followers switched to RUSH mode",
          pass: s.followers.every((f) => f.mode === "RUSH"),
          detail: `modes=[${s.followers.map((f) => f.mode)}]`,
        },
        {
          label: "All followers locked onto the soldier",
          pass: s.followers.length > 0 && s.followers.every((f) => f.rushTarget === soldier),
          detail: `targets=[${s.followers.map((f) => (f.rushTarget === soldier ? "soldier" : String(f.rushTarget)))}]`,
        },
        {
          // Mode alone proves nothing about speed — this is the rush
          // actually running at speed x rushSpeedMult, toward the target.
          label: "Actually beelining at boosted rush speed",
          pass: s.followers.every((f) => f.body?.velocity.x === f.stats.speed * f.stats.rushSpeedMult),
          detail: `vels=[${s.followers.map((f) => f.body?.velocity.x)}]`,
        },
        {
          // Spent to 0 on activation, but a few frames of natural regen
          // pass before this assertion runs — near-zero, not exactly 0.
          label: "Aggro meter spent in one go",
          pass: s.aggro.value < 0.05,
          detail: `value=${s.aggro.value.toFixed(3)}`,
        },
      ];
    }),
  },
  {
    demo: "limbMiss",
    name: "A missed limb lands flat on the ground, marked by an overhead arrow",
    checkpoints: [
      {
        // Airborne: ~0.2s in, it's still well above where it will settle.
        afterMs: 200,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const limb = s.limbs[0];
          return [
            { label: "Limb in flight", pass: !!limb && !limb.resolved, detail: `limbs=${s.limbs.length}` },
            {
              label: "Marker tracks the limb's x while it flies",
              pass: !!limb && Math.abs(limb.marker.x - limb.x) < 0.001,
              detail: `marker.x=${limb ? Math.round(limb.marker.x) : "-"} limb.x=${limb ? Math.round(limb.x) : "-"}`,
            },
            {
              // Characters live in HORDE_SPREAD's depth band, so a projectile
              // at the default depth 0 would disappear behind any follower
              // standing a pixel nearer the camera.
              label: "Limb draws above the horde's depth band",
              pass: !!limb && limb.depth > HORDE_SPREAD.yBand,
              detail: `limb.depth=${limb ? limb.depth : "-"} band=±${HORDE_SPREAD.yBand}`,
            },
          ];
        },
      },
      {
        afterMs: 900,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const limb = s.groundedLimbs[0];
          return [
            { label: "Limb came to rest on the ground", pass: s.groundedLimbs.length === 1, detail: `grounded=${s.groundedLimbs.length}` },
            {
              // The bug this guards: the landing test used to compare
              // against WORLD.groundY, which is Emily's *centre* — so a
              // missed limb stopped half a body height above the floor and
              // hung there in mid-air. It has to rest against GROUND_LINE,
              // measured from its own bottom edge.
              label: "Its bottom edge sits exactly on the ground line, not in mid-air",
              pass: !!limb && Math.abs(limb.y + limb.displayHeight / 2 - GROUND_LINE) < 0.001,
              detail: `bottom=${limb ? (limb.y + limb.displayHeight / 2).toFixed(1) : "-"} groundLine=${GROUND_LINE}`,
            },
            {
              // Deliberately a fixed line rather than a fixed gap above each
              // limb, so several markers read as a row to scan along.
              label: "Marker floats above head height, on the shared marker line",
              pass:
                !!limb &&
                Math.abs(limb.marker.y - LIMB.marker.y) <= LIMB.marker.bobAmplitude &&
                limb.marker.y < s.emily.y - EMILY_SPRITE.bodyHeight / 2,
              detail: `marker.y=${limb ? limb.marker.y.toFixed(1) : "-"} line=${LIMB.marker.y} emilyHead=${s.emily.y - EMILY_SPRITE.bodyHeight / 2}`,
            },
            {
              label: "Marker points down at where the limb is",
              pass: !!limb && Math.abs(limb.marker.x - limb.x) < 0.001,
              detail: `marker.x=${limb ? Math.round(limb.marker.x) : "-"} limb.x=${limb ? Math.round(limb.x) : "-"}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "limbAutoPickup",
    name: "A stuck limb isn't collectable until its paralysis ends, then it returns on contact",
    // The demo puts the soldier inside contact range, so Emily is touching
    // both it and the limb for the whole test — which is exactly what makes
    // the first checkpoint meaningful: the limb is NOT picked up despite
    // being in reach, because it's still holding a soldier down.
    checkpoints: [
      {
        afterMs: 500,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const limb = s.stuckLimbs[0]?.sprite;
          return [
            { label: "Limb stuck in the soldier", pass: s.stuckLimbs.length === 1, detail: `stuck=${s.stuckLimbs.length}` },
            { label: "Soldier still paralyzed by it", pass: s.soldiers[0]?.isParalyzed === true, detail: `state=${s.soldiers[0]?.state}` },
            {
              // Mirrors the pickup rule exactly — horizontal, to the limb's
              // nearest edge (see COMBAT.limbPickupRange). Measuring this
              // differently from the code would be checking a different
              // thing than the game does.
              label: "Emily is in reach of it",
              pass: !!limb && Math.abs(s.emily.x - limb.x) - limb.displayWidth / 2 <= COMBAT.limbPickupRange,
              detail: `gap=${limb ? (Math.abs(s.emily.x - limb.x) - limb.displayWidth / 2).toFixed(1) : "-"} range=${COMBAT.limbPickupRange}`,
            },
            {
              // The invariant that keeps auto-pickup from being an exploit:
              // if contact alone were enough, walking up to feed would yank
              // the limb straight back out and end the paralysis for free.
              label: "Not collected despite contact — paralysis is still running",
              pass: s.ammo === LIMB.ammoMax - 1,
              detail: `ammo=${s.ammo}`,
            },
          ];
        },
      },
      {
        // 2.0s feed + 1.0s convert + margin: the soldier is gone, so the
        // limb's paralysis job is over and it comes free under Emily.
        afterMs: 3600,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          return [
            { label: "Soldier converted, limb released", pass: s.stuckLimbs.length === 0 && s.soldiers.length === 0, detail: `stuck=${s.stuckLimbs.length} soldiers=${s.soldiers.length}` },
            {
              // The behaviour this test exists for: she's already standing
              // there, so it's collected the moment it comes free rather
              // than dropping to the floor to be stepped on separately.
              label: "Collected automatically on contact, without ever lying on the ground",
              pass: s.groundedLimbs.length === 0 && s.fallingLimbs.length === 0,
              detail: `grounded=${s.groundedLimbs.length} falling=${s.fallingLimbs.length}`,
            },
            { label: "Ammo restored by the pickup", pass: s.ammo === LIMB.ammoMax, detail: `ammo=${s.ammo}` },
          ];
        },
      },
    ],
  },
  {
    demo: "limbDrop",
    name: "A stuck limb falls free and lands once its soldier converts",
    checkpoints: [
      {
        // The demo converts the soldier on the spot, so the limb is
        // released on frame 1 and only has ~4px to fall — this is already
        // long past when it should be lying on the ground.
        afterMs: 25 * 16,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          return [
            { label: "Limb no longer stuck", pass: s.stuckLimbs.length === 0, detail: `stuck=${s.stuckLimbs.length}` },
            { label: "Limb finished falling", pass: s.fallingLimbs.length === 0, detail: `falling=${s.fallingLimbs.length}` },
            { label: "Limb landed on the ground", pass: s.groundedLimbs.length === 1, detail: `grounded=${s.groundedLimbs.length}` },
          ];
        },
      },
      {
        afterMs: 50 * 16, // 1.0s convert + margin
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          return [
            { label: "Soldier converted away", pass: s.soldiers.length === 0, detail: `soldiers=${s.soldiers.length}` },
            { label: "Its follower took its place", pass: s.followers.length === 1, detail: `followers=${s.followers.length}` },
            {
              // The demo spends Emily's ammo on the stuck limb and leaves
              // her out of reach of where it drops — ammo staying at 0 here
              // is what proves pickup is by touch, not a passive timer.
              label: "Ammo not refunded on a timer, only on touch",
              pass: s.ammo === 0,
              detail: `ammo=${s.ammo}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "limbDrop",
    name: "Walking onto a landed limb picks it back up",
    // Emily has to be standing where the limb will drop before it lands, so
    // this needs its own run of the demo rather than another checkpoint on
    // the one above (which deliberately keeps her away from it).
    run: (scene) => {
      const s = scene.getTestSnapshot();
      const soldier = s.soldiers[0];
      if (soldier) s.emily.setX(soldier.x);
    },
    checkpoints: single(25, (scene) => {
      const s = scene.getTestSnapshot();
      return [
        { label: "Limb collected off the ground", pass: s.groundedLimbs.length === 0, detail: `grounded=${s.groundedLimbs.length}` },
        { label: "Ammo restored by the pickup (0 -> 1)", pass: s.ammo === 1, detail: `ammo=${s.ammo}` },
      ];
    }),
  },
  {
    demo: "uncappedHorde",
    name: "Converting past the old cap still adds a follower",
    checkpoints: single(200, (scene) => {
      // The Brutes engage and kill the paralyzed soldier on their own
      // (~0.5s), then 1.0s convert + margin.
      const s = scene.getTestSnapshot();
      return [
        {
          // The load-bearing check: under HORDE_CAP this was 4, because
          // 4 Brutes filled the 8-slot budget and the 5th conversion was
          // swallowed. If a headcount limit is ever reintroduced, this is
          // the check that catches it.
          label: "5th follower added (4 Brutes + the new base follower)",
          pass: s.followers.length === 5,
          detail: `followers=${s.followers.length}`,
        },
        {
          label: "The new arrival is a BASE follower",
          pass: s.followers.filter((f) => f.kind === "BASE").length === 1,
          detail: `kinds=[${s.followers.map((f) => f.kind)}]`,
        },
        { label: "Soldier consumed", pass: s.soldiers.length === 0, detail: `soldiers=${s.soldiers.length}` },
      ];
    }),
  },
  {
    demo: "hordeSpread",
    name: "HUD: every readout inside its panel, and the panel off the playfield",
    checkpoints: single(60, (scene) => {
      // The HUD is authored in world pixels and pinned, so its objects carry
      // SCREEN_PIN_OFFSET on top of the numbers in tuning.ts; take it back
      // off to compare against the panel rect as authored.
      const texts = (scene.children.list as Phaser.GameObjects.GameObject[])
        .filter((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text)
        .filter((t) => t.depth === 1000)
        .map((t) => {
          const left = t.x - SCREEN_PIN_OFFSET.x - t.originX * t.width;
          const top = t.y - SCREEN_PIN_OFFSET.y - t.originY * t.height;
          return { text: t.text, left, right: left + t.width, top, bottom: top + t.height };
        });
      const panel = {
        left: HUD.panelX,
        right: HUD.panelX + HUD.panelWidth,
        top: HUD.panelY,
        bottom: HUD.panelY + HUD.panelHeight,
      };
      const pipsRight =
        HUD.ammoPipX + LIMB.ammoMax * HUD.ammoPipWidth + (LIMB.ammoMax - 1) * HUD.ammoPipGap;
      // This demo carries Brutes, so the horde label is at its widest here
      // ("HORDE 8 (5B)") — the case most likely to run into the ammo label.
      const horde = texts.find((t) => t.text.startsWith("HORDE"));
      const ammo = texts.find((t) => t.text.startsWith("AMMO"));
      return [
        {
          label: "Both row labels and the hp readout exist",
          pass: texts.length === 3 && !!horde && !!ammo,
          detail: texts.map((t) => `"${t.text}"`).join(" "),
        },
        {
          // The bug this guards is silent: nothing clips the HUD, so an
          // overflowing element just draws out over the game. The original
          // ammo pips ran 32px past the panel's own right edge unnoticed.
          label: "Every text inside the panel",
          pass: texts.every(
            (t) =>
              t.left >= panel.left &&
              t.right <= panel.right &&
              t.top >= panel.top &&
              t.bottom <= panel.bottom,
          ),
          detail: texts
            .map((t) => `${t.text}:[${t.left.toFixed(0)},${t.right.toFixed(0)}]`)
            .join(" "),
        },
        {
          label: "Ammo pips inside the panel",
          pass: pipsRight <= panel.right && HUD.ammoPipY + HUD.ammoPipHeight <= panel.bottom,
          detail: `pipsRight=${pipsRight} panelRight=${panel.right}`,
        },
        {
          label: "The horde label clears the ammo label rather than drawing through it",
          pass: !!horde && !!ammo && horde.right <= ammo.left,
          detail: `horde.right=${horde ? horde.right.toFixed(0) : "-"} ammo.left=${ammo ? ammo.left.toFixed(0) : "-"}`,
        },
        {
          // The actual ask behind shrinking it: the panel sits over the
          // playfield, so its footprint is screen the player can't see the
          // game through. It used to be 74% x 37%.
          label: "Panel stays a corner badge, not a banner (<50% wide, <20% tall)",
          pass: HUD.panelWidth < WORLD.width * 0.5 && HUD.panelHeight < WORLD.height * 0.2,
          detail: `${HUD.panelWidth}x${HUD.panelHeight} of ${WORLD.width}x${WORLD.height}`,
        },
      ];
    }),
  },
  {
    demo: "hordeSpread",
    name: "Horde spread: every follower on its own line, drawn front to back",
    checkpoints: single(20, (scene) => {
      const { followers } = scene.getTestSnapshot();
      const depths = followers.map((f) => f.depth);
      // The sort key is the *feet* line, not sprite y: a Brute's y also
      // carries its spawnYOffset (-4, because it's a taller sprite), so two
      // figures standing on the same line have different y.
      const feetLine = (f: (typeof followers)[number]) =>
        f.y + (1 - f.originY) * f.displayHeight;
      // Sorting by that line has to reproduce the draw order exactly,
      // otherwise a follower standing further down the street can still paint
      // over one in front of it — which was half the original bug.
      const byFeet = [...followers].sort((a, b) => feetLine(a) - feetLine(b) || a.depth - b.depth);
      const drawOrderMatchesFeet = byFeet.every(
        (f, i) => i === 0 || byFeet[i - 1].depth <= f.depth,
      );
      return [
        {
          label: "Eight followers bunched together",
          pass: followers.length === 8,
          detail: `n=${followers.length}`,
        },
        {
          label: "No two followers share a depth, so none can hide behind another",
          pass: new Set(depths).size === followers.length,
          detail: `depths=${depths.map((d) => d.toFixed(4)).join(",")}`,
        },
        {
          // The bug this guards: the band used to be symmetric, and the
          // street texture starts *at* GROUND_LINE and runs downward — so a
          // negative offset stood a follower on the fence above the road,
          // visibly hanging in the air. Every offset must be forward of the
          // line, never behind it.
          label: `Every depth offset forward of the ground line, within ${HORDE_SPREAD.yBand}px`,
          pass: followers.every((f) => f.depthOffset >= 0 && f.depthOffset <= HORDE_SPREAD.yBand),
          detail: followers.map((f) => f.depthOffset).join(","),
        },
        {
          // ...and the band has to fit on the road as actually drawn, rather
          // than on a number that could drift from the art. The street layer
          // is as tall as its own texture divided by its artScale.
          label: "Every follower's feet are on the drawn street, not above it",
          pass: (() => {
            const layer = BACKGROUND.layers.find((l) => l.key === "bg-ground")!;
            const streetTop = layer.y;
            const streetBottom =
              layer.y + scene.textures.get(layer.key).getSourceImage().height / layer.artScale;
            return followers.every((f) => {
              const feet = feetLine(f);
              return feet >= streetTop - 0.5 && feet <= streetBottom;
            });
          })(),
          detail: followers.map((f) => feetLine(f).toFixed(1)).join(","),
        },
        {
          // The offsets are a fixed table, so this also proves the seed is
          // actually varying per follower rather than every spawn landing on
          // the same entry.
          label: "The band is actually used — more than one distinct offset",
          pass: new Set(followers.map((f) => f.depthOffset)).size >= 3,
          detail: [...new Set(followers.map((f) => f.depthOffset))].join(","),
        },
        {
          label: "Draw order is monotonic in the feet line",
          pass: drawOrderMatchesFeet,
          detail: byFeet.map((f) => `${feetLine(f).toFixed(0)}@${f.depth.toFixed(2)}`).join(" "),
        },
        {
          // Each follower's art is seated against its own line, so the figure
          // really moves. Solving originY against the global GROUND_LINE
          // would cancel the offset out and render every one in the same spot.
          label: "Each follower's feet are on its own ground line",
          pass: followers.every(
            (f) =>
              Math.abs(
                f.y + (1 - f.originY) * f.displayHeight - (GROUND_LINE + f.depthOffset),
              ) < 0.5,
          ),
          detail: followers
            .map((f) => (f.y + (1 - f.originY) * f.displayHeight).toFixed(1))
            .join(","),
        },
      ];
    }),
  },
  {
    demo: "hordeFlank",
    name: "Followers attacking in numbers take both sides; a lone one doesn't",
    run: (scene) => {
      // Everything here is sampled every frame rather than read once at a
      // checkpoint, because both claims are about something that happens
      // *during* a fight that doesn't last long: two base followers kill a
      // 6hp STANDARD in three bites, so the soldier is dead well under a
      // second after they arrive. A fixed-time assertion would be a race
      // against that kill. And the facing claim is about how OFTEN facing
      // changes, which a single reading cannot see at all — a soldier
      // strobing every frame still ends up on a reasonable-looking value.
      const s = scene.getTestSnapshot();
      const ganged = s.soldiers[0];
      const solo = s.soldiers[1];
      const obs = {
        flips: 0,
        surrounded: false,
        surroundedInRange: false,
        surroundedFacing: false,
        soloClosest: Infinity,
        soloTookSide: false,
      };
      let lastFacing = ganged?.facing;
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
        const now = scene.getTestSnapshot();
        if (ganged?.active) {
          if (ganged.facing !== lastFacing) {
            obs.flips++;
            lastFacing = ganged.facing;
          }
          const on = now.followers.filter((f) => f.flankTarget === ganged);
          const left = on.filter((f) => f.x < ganged.x);
          const right = on.filter((f) => f.x > ganged.x);
          if (left.length >= 1 && right.length >= 1) {
            obs.surrounded = true;
            const inRange = on.every(
              (f) =>
                Phaser.Math.Distance.Between(f.x, f.y, ganged.x, ganged.y) <=
                Math.max(COMBAT.contactRange, f.stats.reach),
            );
            const facing = on.every((f) => f.flipX === f.x > ganged.x);
            if (inRange) obs.surroundedInRange = true;
            if (facing) obs.surroundedFacing = true;
          }
        }
        const loner = now.followers.find((f) => f.flankTarget === solo);
        if (loner && solo?.active) {
          obs.soloClosest = Math.min(obs.soloClosest, Math.abs(loner.x - solo.x));
          if (loner.flankSide !== 0) obs.soloTookSide = true;
        }
      });
      (scene as unknown as { __flank?: typeof obs }).__flank = obs;
    },
    checkpoints: [
      {
        // Frame 3: sides are latched the first frame both followers target
        // the same soldier, long before anyone has walked anywhere. Asserting
        // the assignment here rather than from final positions is what proves
        // the mechanism, instead of proving that two bodies drifted apart.
        afterMs: 3 * 16,
        assert: (scene) => {
          const { followers, soldiers } = scene.getTestSnapshot();
          const ganged = followers.filter((f) => f.flankTarget === soldiers[0]);
          const solo = followers.filter((f) => f.flankTarget === soldiers[1]);
          return [
            // Attacker count, the split across both sides, and which of the
            // two is sent across — the same three facts every other surround
            // test opens with, so a rule change fails identically everywhere.
            ...assignmentChecks(scene, soldiers[0]),
            {
              label: "Both fights picked up: the pair on one soldier, 1 on the other",
              pass: ganged.length === FLANK.minEngagers && solo.length === 1,
              detail: `ganged=${ganged.length} solo=${solo.length}`,
            },
            {
              // The threshold is meant literally — one zombie surrounds
              // nothing, and should behave exactly as it did before.
              label: "The lone follower takes no side at all",
              pass: solo[0]?.flankSide === 0,
              detail: `side=${solo[0]?.flankSide}`,
            },
          ];
        },
      },
      {
        // Long enough for both fights to have played out completely.
        afterMs: 1400,
        assert: (scene) => {
          const obs = (scene as unknown as { __flank: {
            flips: number; surrounded: boolean; surroundedInRange: boolean;
            surroundedFacing: boolean; soloClosest: number; soloTookSide: boolean;
          } }).__flank;
          const soloStats = FOLLOWER;
          return [
            {
              label: "The pair got either side of their soldier while it was alive",
              pass: obs.surrounded,
              detail: `surrounded=${obs.surrounded}`,
            },
            {
              // The whole point of the budget in FOLLOWER.flankStandoff: a
              // follower that takes a slot but ends up outside its own reach
              // would make surrounding a silent damage loss.
              label: "And both were inside their own bite range while doing it",
              pass: obs.surroundedInRange,
              detail: `inRange=${obs.surroundedInRange}`,
            },
            {
              // followTarget flips by direction of travel, so the one that
              // crossed to the far side would otherwise stand with its back
              // to the thing it's biting.
              label: "Both faced the soldier, including the one that walked past it",
              pass: obs.surroundedFacing,
              detail: `facing=${obs.surroundedFacing}`,
            },
            {
              label: "The lone follower walked to its soldier's centre, not off to one side",
              pass: obs.soloClosest <= soloStats.deadzone + 1 && !obs.soloTookSide,
              detail: `closest=${obs.soloClosest.toFixed(1)} tookSide=${obs.soloTookSide}`,
            },
            {
              // With zombies on both sides this used to be able to flip every
              // single frame. Bounded by the fight's length over the kind's
              // own turn cooldown, plus the first turn, which is always free.
              label: "It committed to a facing instead of strobing between them",
              pass: obs.flips <= Math.ceil(1.4 / SOLDIER.turnCooldown) + 1,
              detail: `flips=${obs.flips} cooldown=${SOLDIER.turnCooldown}s`,
            },
          ];
        },
      },
    ],
  },
  // The four cases below are the same mechanic against the rest of the
  // roster. They exist because "does the surround work" turned out not to
  // have one answer: the assignment is identical everywhere, but how much of
  // it is ever visible depends on whether the target outlives the walk, and
  // that varies by a factor of four across the enemy kinds.
  {
    demo: "flankGunner",
    name: "A Rifleman gets flanked correctly, and dies before the walk finishes",
    run: (scene) => {
      watchFlank(scene, scene.getTestSnapshot().soldiers[0]);
    },
    checkpoints: [
      { afterMs: 3 * 16, assert: (scene) => assignmentChecks(scene, scene.getTestSnapshot().soldiers[0]) },
      {
        afterMs: 900,
        assert: (scene) => {
          const obs = readFlank(scene);
          const crosser = obs.watched.findIndex((f, i) => obs.crossProgress[i] > 0 && f.x > 0);
          const bestProgress = Math.max(...obs.crossProgress);
          // 2 bites of FOLLOWER.biteDamage (2) each cover RIFLEMAN.hp (4),
          // and both land in the first volley — so the whole fight is one
          // bite cooldown long no matter how the sides were assigned.
          const budgetMs = 700;
          return [
            {
              label: `The gunner died inside ${budgetMs}ms (${RIFLEMAN.hp}hp vs ${FLANK.minEngagers} x ${FOLLOWER.biteDamage} damage)`,
              pass: obs.killMs !== null && obs.killMs <= budgetMs,
              detail: `killMs=${obs.killMs} firstBiteMs=${obs.firstBiteMs}`,
            },
            {
              // The honest version of "does it surround a Rifleman": the
              // crossing is not slow or broken, it is simply longer than the
              // fight. Progress, not arrival, is the claim this scenario can
              // actually support — measured ~99% complete at the kill.
              label: "The follower sent across had covered >=90% of the way to its far slot by then",
              pass: bestProgress >= 0.9,
              detail: `progress=${bestProgress.toFixed(2)} crosser=${crosser}`,
            },
            {
              // RIFLEMAN.aimDuration (0.9s) is longer than the fight, and
              // its contactDamage is 0 — so a gang-up on a gunner is free.
              label: "Both followers survived it (contactDamage 0, and it never finished a windup)",
              pass: obs.survived.every(Boolean),
              detail: `survived=${obs.survived.join(",")}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "flankShield",
    name: "A paralyzed Shield Trooper is surrounded, in range, and held there",
    run: (scene) => {
      watchFlank(scene, scene.getTestSnapshot().soldiers[0]);
    },
    checkpoints: [
      { afterMs: 3 * 16, assert: (scene) => assignmentChecks(scene, scene.getTestSnapshot().soldiers[0]) },
      {
        afterMs: 1300,
        assert: (scene) => {
          const obs = readFlank(scene);
          // Comfortably longer than the ~550ms the surround takes to close,
          // so this fails if the demo ever goes back to ending on arrival.
          const MIN_HELD_MS = 500;
          const held =
            obs.surroundedInRangeMs !== null && obs.surroundedInRangeUntilMs !== null
              ? obs.surroundedInRangeUntilMs - obs.surroundedInRangeMs
              : 0;
          return [
            {
              label: "Both sides were held with both followers inside their own bite reach",
              pass: obs.everSurroundedInRange,
              detail: `atMs=${obs.surroundedInRangeMs}`,
            },
            {
              // The one that crossed arrives travelling away from its target;
              // faceToward is what turns it back round.
              label: "Both faced inward while doing it",
              pass: obs.everFacedInward,
              detail: `faced=${obs.everFacedInward}`,
            },
            {
              // Why this demo both paralyzes and uses DEMO.surroundTargetHp:
              // at real HP the surround is on screen for a few frames, which
              // is long enough to assert but far too short to *watch*. The
              // duration is measured directly rather than as "kill minus
              // surround", so it stays meaningful now the target routinely
              // outlives the checkpoint.
              label: `And held it for >=${MIN_HELD_MS}ms rather than a single frame`,
              pass: held >= MIN_HELD_MS,
              detail: `heldMs=${held} killMs=${obs.killMs}`,
            },
            {
              // Not "they ended up either side of it" — they parked at the
              // slot the standoff puts them at. A follower that drifted
              // through the target would satisfy the side check and fail
              // this one.
              label: "Each parked within its deadzone of its own flank slot",
              pass: obs.minSlotGap.every((g) => g <= FOLLOWER.deadzone),
              detail: `gaps=${obs.minSlotGap.map((g) => g.toFixed(1)).join(",")}`,
            },
            {
              label: "Both survived — a paralyzed soldier can't hit back",
              pass: obs.survived.every(Boolean),
              detail: `survived=${obs.survived.join(",")}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "flankBothSides",
    name: "Followers already either side of a target are not asked to cross",
    // "Nearest crosses" is only the tie-break for the usual case, where
    // everyone arrives from Emily's side and the far side is uncovered. When
    // somebody is already standing round the back, the cheapest assignment
    // is for nobody to move at all — a rule that always sent the nearest
    // across would walk this pair through each other for no reason, and
    // would undo the very thing it is supposed to produce.
    //
    // This is its own demo rather than a second test on flankShield because
    // a test's run() hook fires several frames after the demo's setup, by
    // which time the sides have already latched — moving a follower then
    // would prove nothing about how the side was chosen.
    run: (scene) => {
      watchFlank(scene, scene.getTestSnapshot().soldiers[0]);
    },
    checkpoints: [
      {
        afterMs: 3 * 16,
        assert: (scene) => {
          const { followers, soldiers } = scene.getTestSnapshot();
          const target = soldiers[0];
          const on = followers.filter((f) => f.flankTarget === target);
          const keptOwnSide = on.every((f) => f.flankSide === (Math.sign(f.x - target.x) || 1));
          const sides = on.map((f) => f.flankSide).sort();
          return [
            {
              label: "Both engage it, from opposite sides to begin with",
              pass:
                on.length === FLANK.minEngagers &&
                on.some((f) => f.x < target.x) &&
                on.some((f) => f.x > target.x),
              detail: `attackers=${on.length} dx=${on.map((f) => (f.x - target.x).toFixed(0)).join(",")}`,
            },
            {
              label: "Neither is sent across — each latches the side it is already on",
              pass: keptOwnSide && sides.length === 2 && sides[0] === -1 && sides[1] === 1,
              detail: `sides=${sides.join(",")} keptOwnSide=${keptOwnSide}`,
            },
          ];
        },
      },
      {
        afterMs: 1300,
        assert: (scene) => {
          const obs = readFlank(scene);
          return [
            {
              // The pay-off of not crossing: because neither has to walk
              // round, both are in contact on opposite sides from the moment
              // they arrive, which is the earliest a surround can possibly
              // form.
              label: "Both closed into their own bite reach on opposite sides",
              pass: obs.everSurroundedInRange,
              detail: `atMs=${obs.surroundedInRangeMs} killMs=${obs.killMs}`,
            },
            {
              label: "Each parked within its deadzone of its own flank slot",
              pass: obs.minSlotGap.every((g) => g <= FOLLOWER.deadzone),
              detail: `gaps=${obs.minSlotGap.map((g) => g.toFixed(1)).join(",")}`,
            },
            {
              label: "Both faced inward",
              pass: obs.everFacedInward,
              detail: `faced=${obs.everFacedInward}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "flankShieldActive",
    name: "Base followers ganging an un-paralyzed Shield Trooper lose the fight",
    run: (scene) => {
      watchFlank(scene, scene.getTestSnapshot().soldiers[0]);
    },
    checkpoints: [
      { afterMs: 3 * 16, assert: (scene) => assignmentChecks(scene, scene.getTestSnapshot().soldiers[0]) },
      {
        afterMs: 1800,
        assert: (scene) => {
          const obs = readFlank(scene);
          const shield = scene.getTestSnapshot().soldiers[0];
          // Three bites land before the second follower dies; the numbers are
          // read from tuning so a retune fails this loudly instead of
          // silently changing what the fight means.
          const expectedHp = SHIELD_TROOPER.hp - 3 * FOLLOWER.biteDamage;
          return [
            {
              label: `One contact hit is a whole base follower (contactDamage ${SHIELD_TROOPER.contactDamage} >= hp ${FOLLOWER.hp})`,
              pass: SHIELD_TROOPER.contactDamage >= FOLLOWER.hp,
              detail: `${SHIELD_TROOPER.contactDamage} vs ${FOLLOWER.hp}`,
            },
            {
              label: "Both followers died",
              pass: obs.survived.every((s) => !s),
              detail: `survived=${obs.survived.join(",")}`,
            },
            {
              label: `The Shield walked away alive on ${expectedHp}hp`,
              pass: shield?.active === true && shield.hp === expectedHp,
              detail: `hp=${shield?.hp} expected=${expectedHp}`,
            },
            {
              // The mechanic is not what loses this fight — the sides latch
              // exactly as they do in every other scenario (asserted at the
              // checkpoint above). What the pair never gets is the *time* to
              // stand on both sides at once. Intended: the answer to a
              // Shield is a paralyze first, not more bodies.
              label: "Neither lived long enough to hold both sides in contact at once",
              pass: !obs.everSurroundedInRange,
              detail: `everInRange=${obs.everSurroundedInRange}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "flankBrutes",
    name: "Brutes take sides the same way, then kill the target before the crossing lands",
    run: (scene) => {
      watchFlank(scene, scene.getTestSnapshot().soldiers[0]);
    },
    checkpoints: [
      { afterMs: 3 * 16, assert: (scene) => assignmentChecks(scene, scene.getTestSnapshot().soldiers[0]) },
      {
        afterMs: 900,
        assert: (scene) => {
          const obs = readFlank(scene);
          const bothBrutes = obs.watched.every((f) => f.kind === "BRUTE");
          const budgetMs = 700;
          return [
            {
              label: "The roster under test really is two Brutes",
              pass: bothBrutes && obs.watched.length === FLANK.minEngagers,
              detail: `kinds=${obs.watched.map((f) => f.kind).join(",")}`,
            },
            {
              // Two bites, not three: this is why nothing in the current
              // roster can be seen surrounded by Brutes, and it's a tuning
              // fact rather than a flanking one.
              label: `Two Brute bites (${BRUTE.biteDamage} each) cover the toughest enemy in the game (${SHIELD_TROOPER.hp}hp)`,
              pass: 2 * BRUTE.biteDamage >= SHIELD_TROOPER.hp,
              detail: `${2 * BRUTE.biteDamage} vs ${SHIELD_TROOPER.hp}`,
            },
            {
              label: `So the Shield died inside ${budgetMs}ms`,
              pass: obs.killMs !== null && obs.killMs <= budgetMs,
              detail: `killMs=${obs.killMs} firstBiteMs=${obs.firstBiteMs}`,
            },
            {
              // Recorded as the honest outcome, not as a defect: the sides
              // are assigned correctly (checkpoint above) and the crossing is
              // under way, but BRUTE.speed (105) over standoff+distance is
              // slower than two bites. If a future retune makes this pass
              // differently, the ruling on it should be revisited too.
              label: "But the pair never held both sides in contact — it died mid-crossing",
              pass: !obs.everSurroundedInRange,
              detail: `everInRange=${obs.everSurroundedInRange} progress=${obs.crossProgress.map((p) => p.toFixed(2)).join(",")}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "flankMixed",
    name: "A mixed roster crosses by distance, and each kind keeps its own standoff",
    run: (scene) => {
      watchFlank(scene, scene.getTestSnapshot().soldiers[0]);
    },
    checkpoints: [
      {
        afterMs: 3 * 16,
        assert: (scene) => {
          const target = scene.getTestSnapshot().soldiers[0];
          const on = scene.getTestSnapshot().followers.filter((f) => f.flankTarget === target);
          const base = on.find((f) => f.kind === "BASE");
          const brute = on.find((f) => f.kind === "BRUTE");
          const baseOwnSide = base ? Math.sign(base.x - target.x) || 1 : 0;
          return [
            ...assignmentChecks(scene, target),
            {
              // The nearest here is deliberately the *lighter* unit, so this
              // fails if the rule ever starts preferring a kind (or a rank)
              // over plain distance.
              label: "The light unit is the one sent across, and the Brute keeps the near side",
              pass:
                !!base && !!brute && base.flankSide === -baseOwnSide && brute.flankSide === baseOwnSide,
              detail: `base=${base?.flankSide} brute=${brute?.flankSide} baseOwnSide=${baseOwnSide}`,
            },
          ];
        },
      },
      {
        afterMs: 900,
        assert: (scene) => {
          const obs = readFlank(scene);
          const baseIdx = obs.watched.findIndex((f) => f.kind === "BASE");
          // The inequality documented on FOLLOWER.flankStandoff, checked per
          // kind rather than trusted: a follower's worst-case vertical offset
          // from a soldier's own line is the top of the horde band plus that
          // kind's spawnYOffset, and the slot has to stay inside the circle
          // its reach cuts at that height. This is the guard that surrounding
          // never silently costs damage.
          const budget = (s: typeof FOLLOWER) => {
            const dy = HORDE_SPREAD.yBand + s.spawnYOffset;
            return {
              need: s.flankStandoff + s.deadzone + Math.max(...FLANK.sideJitter.map(Math.abs)),
              have: Math.sqrt(s.reach * s.reach - dy * dy),
            };
          };
          const b = budget(FOLLOWER);
          const r = budget(BRUTE);
          return [
            {
              label: "The base follower parked on the far side at its own standoff",
              pass: baseIdx >= 0 && obs.minSlotGap[baseIdx] <= FOLLOWER.deadzone,
              detail: `gap=${obs.minSlotGap[baseIdx]?.toFixed(1)} standoff=${FOLLOWER.flankStandoff}`,
            },
            {
              label: "The two kinds stand off by different amounts, from their own stats",
              pass: BRUTE.flankStandoff !== FOLLOWER.flankStandoff,
              detail: `base=${FOLLOWER.flankStandoff} brute=${BRUTE.flankStandoff}`,
            },
            {
              label: "A base follower's slot stays inside its own bite reach",
              pass: b.need <= b.have,
              detail: `${b.need.toFixed(1)} <= ${b.have.toFixed(1)}`,
            },
            {
              label: "A Brute's slot stays inside its own (longer) bite reach",
              pass: r.need <= r.have,
              detail: `${r.need.toFixed(1)} <= ${r.have.toFixed(1)}`,
            },
            {
              label: "The fight got far enough for both to be engaging it at once",
              pass: obs.attackersSeen === FLANK.minEngagers,
              detail: `attackersSeen=${obs.attackersSeen}`,
            },
          ];
        },
      },
    ],
  },
  // The three cases below are the front-slot depth rule (docs/RENDERING.md
  // section 2): a follower that has flanked draws in front of the soldier it
  // is biting, but only FLANK.frontSlotsPerSide of them per side. Every claim
  // compares a follower's depth against its *actual target's* depth rather
  // than against the constant, so they still mean something if the depth
  // table is renumbered.
  {
    demo: "flankMixed",
    name: "A flanker in bite range draws in front of the soldier it is biting",
    // Sampled every frame: the lift only applies while a follower is both
    // latched to a side and inside its own bite reach, which is a window
    // that opens partway through the approach and closes when the target
    // dies. A fixed-time assertion would be a race against both edges.
    run: (scene) => {
      const seen = { base: false, brute: false, everInRangeBehind: false, samples: 0, firstBehind: "" };
      (scene as unknown as { __frontObs?: typeof seen }).__frontObs = seen;
      // Arcade integrates velocity into position between scene.update() and
      // POST_UPDATE, so this sampler sees a follower cross into bite range
      // one step before GameScene's own depth pass did. The lift therefore
      // lands on the *next* frame, which is invisible at 60fps but real —
      // so a follower only counts as wrongly-behind if it was already in
      // range at the previous sample too. Without this the case fails on
      // exactly one frame per fight, and only under the suite's batch
      // stepping (a live run never shows it).
      const wasInRange = new Set<Follower>();
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
        const snap = scene.getTestSnapshot();
        const nowInRange = new Set<Follower>();
        snap.followers.forEach((f) => {
          const t = f.flankTarget;
          if (!t || !t.active || t.hp <= 0 || f.flankSide === 0) return;
          const inRange =
            Phaser.Math.Distance.Between(f.x, f.y, t.x, t.y) <=
            Math.max(COMBAT.contactRange, f.stats.reach);
          if (!inRange) return;
          nowInRange.add(f);
          seen.samples++;
          if (f.depth > t.depth) {
            if (f.kind === "BRUTE") seen.brute = true;
            else seen.base = true;
          } else if (wasInRange.has(f)) {
            seen.everInRangeBehind = true;
            if (!seen.firstBehind) {
              seen.firstBehind = `${f.kind} side=${f.flankSide} front=${f.frontSlot} fd=${f.depth.toFixed(3)} td=${t.depth} dist=${Phaser.Math.Distance.Between(f.x, f.y, t.x, t.y).toFixed(1)} targetHp=${t.hp}`;
            }
          }
        });
        wasInRange.clear();
        nowInRange.forEach((f) => wasInRange.add(f));
      });
    },
    checkpoints: [
      {
        afterMs: 1500,
        assert: (scene) => {
          const seen = (scene as unknown as { __frontObs: { base: boolean; brute: boolean; everInRangeBehind: boolean; samples: number; firstBehind: string } }).__frontObs;
          return [
            {
              // Guards the two claims below from passing vacuously if the
              // fight ever stops producing an in-range flanker at all.
              label: "The fight actually produced in-range flankers to judge",
              pass: seen.samples > 0,
              detail: `samples=${seen.samples}`,
            },
            {
              label: "The base follower drew in front of its target while biting it",
              pass: seen.base,
              detail: `base=${seen.base}`,
            },
            {
              // Both kinds, because a Brute's longer reach lets it bite from
              // further out — if the lift were keyed off a single hardcoded
              // distance rather than each kind's own reach, this is the one
              // that would fail.
              label: "So did the Brute, on its own (longer) reach",
              pass: seen.brute,
              detail: `brute=${seen.brute}`,
            },
            {
              label: "No latched flanker was ever left behind its target while in range",
              pass: !seen.everInRangeBehind,
              detail: seen.firstBehind || "none",
            },
          ];
        },
      },
    ],
  },
  {
    demo: "hordeFlank",
    name: "A lone engager is not lifted — it would cover its target outright",
    // The right-hand fight in this demo is one follower on one soldier,
    // below FLANK.minEngagers, so it never takes a side and walks at the
    // soldier's exact centre. Lifting that one would hide the soldier
    // completely rather than flank it, which is the case
    // CHARACTER_FRONT_DEPTH exists to prevent.
    run: (scene) => {
      const seen = { inContact: 0, liftedWhileCentred: 0 };
      (scene as unknown as { __loneObs?: typeof seen }).__loneObs = seen;
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
        const snap = scene.getTestSnapshot();
        snap.followers.forEach((f) => {
          const t = f.flankTarget;
          if (!t || !t.active || t.hp <= 0 || f.flankSide !== 0) return;
          const inRange =
            Phaser.Math.Distance.Between(f.x, f.y, t.x, t.y) <=
            Math.max(COMBAT.contactRange, f.stats.reach);
          if (!inRange) return;
          seen.inContact++;
          if (f.depth > t.depth) seen.liftedWhileCentred++;
        });
      });
    },
    checkpoints: [
      {
        afterMs: 1500,
        assert: (scene) => {
          const seen = (scene as unknown as { __loneObs: { inContact: number; liftedWhileCentred: number } }).__loneObs;
          return [
            {
              label: "A side-0 follower did reach contact with its target",
              pass: seen.inContact > 0,
              detail: `frames=${seen.inContact}`,
            },
            {
              label: "And was never lifted in front of it",
              pass: seen.liftedWhileCentred === 0,
              detail: `liftedFrames=${seen.liftedWhileCentred}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "flankOverflow",
    name: "Front slots are capped per side — the overflow stays behind the target",
    run: (scene) => {
      const seen = {
        crowdedSideSeen: false,
        capViolated: false,
        occludedSeen: false,
        loneSideLifted: false,
        emilyBuried: false,
        worst: "",
      };
      (scene as unknown as { __capObs?: typeof seen }).__capObs = seen;
      scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
        const snap = scene.getTestSnapshot();
        const target = snap.soldiers.find((s) => s.active && s.hp > 0);
        if (!target) return;
        const inRange = snap.followers.filter(
          (f) =>
            f.flankTarget === target &&
            f.flankSide !== 0 &&
            Phaser.Math.Distance.Between(f.x, f.y, target.x, target.y) <=
              Math.max(COMBAT.contactRange, f.stats.reach),
        );
        if (!inRange.length) return;
        ([-1, 1] as const).forEach((side) => {
          const onSide = inRange.filter((f) => f.flankSide === side);
          if (!onSide.length) return;
          const front = onSide.filter((f) => f.depth > target.depth);
          if (onSide.length > FLANK.frontSlotsPerSide) {
            seen.crowdedSideSeen = true;
            if (front.length !== FLANK.frontSlotsPerSide) {
              seen.capViolated = true;
              seen.worst = `side=${side} onSide=${onSide.length} front=${front.length}`;
            }
            if (onSide.length - front.length > 0) seen.occludedSeen = true;
          } else if (front.length === onSide.length) {
            seen.loneSideLifted = true;
          }
        });
        if (inRange.some((f) => f.depth >= snap.emily.depth)) seen.emilyBuried = true;
      });
    },
    checkpoints: [
      {
        afterMs: 1500,
        assert: (scene) => {
          const seen = (scene as unknown as {
            __capObs: {
              crowdedSideSeen: boolean;
              capViolated: boolean;
              occludedSeen: boolean;
              loneSideLifted: boolean;
              emilyBuried: boolean;
              worst: string;
            };
          }).__capObs;
          return [
            {
              // Without this the cap assertion below would pass trivially on
              // a scenario that never actually crowded a side.
              label: "A side really did hold more attackers than it has front slots",
              pass: seen.crowdedSideSeen,
              detail: `crowded=${seen.crowdedSideSeen}`,
            },
            {
              label: `Exactly FLANK.frontSlotsPerSide (${FLANK.frontSlotsPerSide}) drew in front on that side`,
              pass: seen.crowdedSideSeen && !seen.capViolated,
              detail: seen.worst || "no violation",
            },
            {
              label: "The overflow stayed behind the target rather than being lifted too",
              pass: seen.occludedSeen,
              detail: `occluded=${seen.occludedSeen}`,
            },
            {
              // The cap is per side, not a global budget: a two-sided
              // surround must lift one from each, not one in total.
              label: "The uncrowded side still got its attacker lifted",
              pass: seen.loneSideLifted,
              detail: `loneSideLifted=${seen.loneSideLifted}`,
            },
            {
              label: "Emily still drew above every lifted follower",
              pass: !seen.emilyBuried,
              detail: `buried=${seen.emilyBuried}`,
            },
          ];
        },
      },
    ],
  },
  {
    demo: "death",
    name: "Emily reaching 0 HP triggers game over",
    // The soldier spawns already in contact range, so the fatal hit lands
    // within the first couple of frames — keep this well under the 1.2s
    // death fade-out, since triggerDeath() auto-restarts the scene (back to
    // a clean isGameOver=false level) once that fade completes.
    checkpoints: single(10, (scene) => {
      const s = scene.getTestSnapshot();
      return [
        {
          label: `Emily hit exactly 0 HP (1 - ${SOLDIER.contactDamage} contact damage)`,
          pass: s.emily.hp === 0,
          detail: `hp=${s.emily.hp}`,
        },
        { label: "isGameOver flips true", pass: s.isGameOver === true, detail: `got ${s.isGameOver}` },
      ];
    }),
  },
  {
    demo: "cleared",
    name: "An empty level triggers CLEARED",
    checkpoints: single(2, (scene) => {
      const s = scene.getTestSnapshot();
      return [
        { label: "No soldiers remain", pass: s.soldiers.length === 0, detail: `soldiers=${s.soldiers.length}` },
        { label: "isCleared flips true", pass: s.isCleared === true, detail: `got ${s.isCleared}` },
      ];
    }),
  },
  {
    demo: "shieldBlock",
    name: "A frontal hit deflects off the shield instead of paralyzing",
    // Thrown in 8px above the ground line, the way a real thrown limb
    // arrives — a hit at exactly ground level would be marked "landed" on
    // the same frame it deflects, hiding the bounce entirely.
    run: (scene) => {
      const soldier = scene.getTestSnapshot().soldiers[0];
      if (soldier) scene.debugSpawnLimb(soldier.x, soldier.y - 8, 250); // frontal (facing -1)
    },
    checkpoints: single(20, (scene) => {
      const s = scene.getTestSnapshot();
      const soldier = s.soldiers[0];
      const limb = s.fallingLimbs[0] ?? s.groundedLimbs[0];
      // Mid-bounce it's still falling; a few frames later it has settled —
      // either counts as "not stuck".
      const bounced = s.fallingLimbs.length + s.groundedLimbs.length === 1;
      return [
        { label: "Soldier stays ACTIVE, not paralyzed", pass: soldier?.state === "ACTIVE", detail: `got ${soldier?.state}` },
        { label: "Limb never sticks in the shield", pass: s.stuckLimbs.length === 0, detail: `stuck=${s.stuckLimbs.length}` },
        { label: "Limb bounces off (falls or lands)", pass: bounced, detail: `falling=${s.fallingLimbs.length} grounded=${s.groundedLimbs.length}` },
        {
          // The deflect has to send it back the way it came, toward Emily —
          // it arrived moving right, so by now it must be well left of the
          // trooper it hit, not still travelling through him.
          label: "Deflected back toward Emily, not through him",
          pass: limb !== undefined && soldier !== undefined && limb.x < soldier.x - 15,
          detail: `limb=${limb?.x.toFixed(0)} soldier=${soldier?.x.toFixed(0)}`,
        },
      ];
    }),
  },
  {
    demo: "shieldFlank",
    name: "Aggro sends the whole horde to rush the shield trooper",
    run: (scene) => {
      const s = scene.getTestSnapshot();
      s.aggro.tryActivate(s.followers, s.soldiers);
    },
    checkpoints: [
      {
        afterMs: 3 * 16,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const shield = s.soldiers[0];
          return [
            { label: "Both followers still present", pass: s.followers.length === 2, detail: `followers=${s.followers.length}` },
            {
              label: "All followers switched to RUSH mode",
              pass: s.followers.every((f) => f.mode === "RUSH"),
              detail: `modes=[${s.followers.map((f) => f.mode)}]`,
            },
            {
              label: "All followers targeting the shield trooper",
              pass: s.followers.length > 0 && s.followers.every((f) => f.rushTarget === shield),
              detail: `targets match=${s.followers.every((f) => f.rushTarget === shield)}`,
            },
          ];
        },
      },
      {
        // ~0.6s to cross the 120px gap at rush speed, then bites land —
        // the rush is only worth anything if it actually connects, which
        // "mode === RUSH" on its own never proves.
        afterMs: 57 * 16,
        assert: (scene) => {
          const shield = scene.getTestSnapshot().soldiers[0];
          return [
            {
              label: "Bites get through where a frontal limb can't",
              pass: shield !== undefined && shield.hp < SHIELD_TROOPER.hp,
              detail: `hp ${shield?.hp}/${SHIELD_TROOPER.hp}`,
            },
            { label: "Bites damage but never paralyze (still ACTIVE)", pass: shield?.state === "ACTIVE", detail: `got ${shield?.state}` },
          ];
        },
      },
    ],
  },
  {
    demo: "gunnerShot",
    name: "An unobstructed Rifleman windup lands a hit on Emily",
    checkpoints: single(105, (scene) => {
      // 0.9s windup + ~0.43s of bullet travel, landing at ~frame 80
      const emily = scene.getTestSnapshot().emily;
      return [
        {
          // Exact, not just "took damage": the Rifleman's contactDamage is
          // 0, so only its bullet can move this number at all.
          label: `Emily took exactly one bullet (${RIFLEMAN.bulletDamage} dmg)`,
          pass: emily.hp === EMILY.maxHp - RIFLEMAN.bulletDamage,
          detail: `hp=${emily.hp}/${EMILY.maxHp}`,
        },
      ];
    }),
  },
  {
    demo: "gunnerShot",
    name: "A limb landing mid-windup cancels the shot",
    // Lobbed in from short range and 24px up so it arrives ~0.25s later —
    // partway through the 0.9s windup, rather than on the frame the aim
    // starts, which would prove nothing about interrupting one.
    run: (scene) => {
      const soldier = scene.getTestSnapshot().soldiers[0];
      if (soldier) scene.debugSpawnLimb(soldier.x - 30, soldier.y - 24, 120);
    },
    checkpoints: [
      {
        afterMs: 5 * 16,
        assert: (scene) => {
          const soldier = scene.getTestSnapshot().soldiers[0];
          return [{ label: "Windup is underway when the limb is in the air", pass: soldier?.isAiming === true, detail: `aim=${soldier?.aimRemaining.toFixed(2)}` }];
        },
      },
      {
        afterMs: 25 * 16,
        assert: (scene) => {
          const soldier = scene.getTestSnapshot().soldiers[0];
          return [
            { label: "The hit paralyzes it mid-aim", pass: soldier?.state === "PARALYZED", detail: `got ${soldier?.state}` },
            {
              // Cancelled, not merely suspended for the paralysis — the
              // aim timer is wound all the way back to 0.
              label: "Windup cancelled outright, not paused",
              pass: soldier?.aimRemaining === 0 && soldier?.pendingShot === false,
              detail: `aim=${soldier?.aimRemaining} pending=${soldier?.pendingShot}`,
            },
            {
              label: "No charged shot waiting to fire on recovery",
              pass: (soldier?.fireCooldownRemaining ?? 0) >= RIFLEMAN.fireCooldown,
              detail: `cd=${soldier?.fireCooldownRemaining.toFixed(2)}`,
            },
          ];
        },
      },
      {
        // Past frame ~80, when the uninterrupted shot (see the test above)
        // would have hit her.
        afterMs: 80 * 16,
        assert: (scene) => {
          const emily = scene.getTestSnapshot().emily;
          return [{ label: "Emily never gets shot", pass: emily.hp === EMILY.maxHp, detail: `hp=${emily.hp}/${EMILY.maxHp}` }];
        },
      },
    ],
  },
  {
    demo: "gunnerBlock",
    name: "A follower in the lane absorbs the shot instead of Emily",
    checkpoints: single(90, (scene) => {
      const s = scene.getTestSnapshot();
      const rifleman = s.soldiers[0];
      return [
        {
          // Without this, "Emily left untouched" would also pass on a
          // Rifleman that never pulled the trigger at all.
          label: "Rifleman committed and fired its shot",
          pass: (rifleman?.fireCooldownRemaining ?? 0) > 0,
          detail: `cd=${rifleman?.fireCooldownRemaining.toFixed(2)} aim=${rifleman?.aimRemaining.toFixed(2)}`,
        },
        { label: "Follower dies absorbing the shot", pass: s.followers.length === 0, detail: `followers=${s.followers.length}` },
        { label: "Emily left untouched", pass: s.emily.hp === EMILY.maxHp, detail: `hp=${s.emily.hp}/${EMILY.maxHp}` },
      ];
    }),
  },
  {
    demo: "gunnerRush",
    name: "Aggro sends the horde to rush the Rifleman",
    run: (scene) => {
      const s = scene.getTestSnapshot();
      s.aggro.tryActivate(s.followers, s.soldiers);
    },
    checkpoints: [
      {
        afterMs: 3 * 16,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const rifleman = s.soldiers[0];
          return [
            { label: "Both followers still present", pass: s.followers.length === 2, detail: `followers=${s.followers.length}` },
            {
              label: "All followers switched to RUSH mode",
              pass: s.followers.every((f) => f.mode === "RUSH"),
              detail: `modes=[${s.followers.map((f) => f.mode)}]`,
            },
            {
              label: "All followers targeting the Rifleman",
              pass: s.followers.length > 0 && s.followers.every((f) => f.rushTarget === rifleman),
              detail: `targets match=${s.followers.every((f) => f.rushTarget === rifleman)}`,
            },
          ];
        },
      },
      {
        // ~1.0s to close the 200px gap at rush speed, killing it at ~frame
        // 68 — before its 0.9s windup (started once the lead follower came
        // inside fireRange) could ever resolve into a bullet.
        afterMs: 90 * 16,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const rifleman = s.soldiers[0];
          return [
            {
              label: "Rush kills the Rifleman",
              pass: rifleman === undefined || rifleman.state === "CONVERTING",
              detail: `state=${rifleman?.state ?? "removed"}`,
            },
            { label: "Lane closed before Emily was ever shot", pass: s.emily.hp === EMILY.maxHp, detail: `hp=${s.emily.hp}/${EMILY.maxHp}` },
          ];
        },
      },
    ],
  },
  {
    demo: "fusionAuto",
    name: "4 base followers auto-fuse into 1 Brute with no input",
    checkpoints: single(3, (scene) => {
      const s = scene.getTestSnapshot();
      const brute = s.followers[0];
      return [
        { label: "Exactly 1 follower remains", pass: s.followers.length === 1, detail: `followers=${s.followers.length}` },
        { label: "It's a BRUTE", pass: brute?.kind === "BRUTE", detail: `kind=${brute?.kind}` },
        { label: "Spawned at full HP", pass: brute?.hp === brute?.stats.hp, detail: `hp=${brute?.hp}/${brute?.stats.hp}` },
        // (A slot-budget check used to sit here, proving fusion freed
        // capacity under HORDE_CAP. The cap is gone — docs/PROGRESSION.md
        // §1 — and rewriting it against `kind` would only have restated
        // the two checks above, so it's dropped rather than kept as a
        // check that can't fail.)
      ];
    }),
  },
  {
    demo: "bruteExecute",
    name: "A Brute one-shots a paralyzed Shield Trooper",
    // ~0.2s to close into reach, and BRUTE.biteCooldown is 0.9s — so
    // landing inside this window means it died to a single bite, which is
    // the whole claim. A wider window would also pass on a two-bite kill.
    checkpoints: single(30, (scene) => {
      const s = scene.getTestSnapshot();
      const soldier = s.soldiers[0];
      const brute = s.followers[0];
      return [
        {
          label: "Shield trooper dead or converting after one bite",
          pass: soldier === undefined || soldier.state === "CONVERTING",
          detail: `state=${soldier?.state ?? "removed"} hp=${soldier?.hp}`,
        },
        { label: "Brute unharmed — a paralyzed target can't retaliate", pass: brute?.hp === brute?.stats.hp, detail: `hp=${brute?.hp}/${brute?.stats.hp}` },
      ];
    }),
  },
  {
    demo: "bruteVsGunner",
    name: "A Brute closes and kills a lone Rifleman before it can fire",
    // Deliberately inside the Rifleman's 0.9s windup (~frame 56): the
    // Brute reaches it at ~frame 20, so a kill confirmed here is a kill
    // that beat the shot, not just one that happened eventually.
    checkpoints: single(45, (scene) => {
      const s = scene.getTestSnapshot();
      const brute = s.followers[0];
      const soldier = s.soldiers[0];
      return [
        {
          label: "Rifleman dead or converting",
          pass: soldier === undefined || soldier.state === "CONVERTING",
          detail: `state=${soldier?.state ?? "removed"}`,
        },
        {
          // fireCooldownRemaining is only ever set by a committed shot, so
          // still being 0 means it died with the windup unfinished.
          label: "It died mid-windup, never got a shot off",
          pass: (soldier?.fireCooldownRemaining ?? 0) <= 0,
          detail: `cd=${soldier?.fireCooldownRemaining.toFixed(2)}`,
        },
        { label: "Brute took no damage", pass: brute?.hp === brute?.stats.hp, detail: `hp=${brute?.hp}/${brute?.stats.hp}` },
      ];
    }),
  },
  {
    demo: "fusionViaCombat",
    name: "3 followers killing a soldier triggers live auto-fusion",
    checkpoints: [
      {
        // ~0.65s to close and land the three bites that kill it, then a
        // 1.0s convert — this lands in the middle of that convert, while
        // there are still only 3 followers and no Brute anywhere.
        afterMs: 70 * 16,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const soldier = s.soldiers[0];
          return [
            {
              label: "The 3 followers kill the soldier on their own",
              pass: soldier === undefined || soldier.state === "CONVERTING",
              detail: `state=${soldier?.state ?? "removed"}`,
            },
            { label: "Still 3 followers — nothing has fused yet", pass: s.followers.length === 3, detail: `followers=${s.followers.length}` },
          ];
        },
      },
      {
        afterMs: 75 * 16, // rest of the convert + the fusion it triggers
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const brute = s.followers[0];
          return [
            { label: "Exactly 1 follower remains", pass: s.followers.length === 1, detail: `followers=${s.followers.length}` },
            { label: "The 4th conversion triggered fusion into a BRUTE", pass: brute?.kind === "BRUTE", detail: `kind=${brute?.kind}` },
            { label: "The new Brute starts at full HP", pass: brute?.hp === brute?.stats.hp, detail: `hp=${brute?.hp}/${brute?.stats.hp}` },
          ];
        },
      },
    ],
  },
  {
    demo: "callForHelp",
    name: "A melee soldier answers the call and actually reaches/attacks Emily",
    checkpoints: [
      {
        // The response starts on frame 1 with an off-screen entrance, so
        // by now the soldier has been moved right of the 320px viewport
        // and is already walking back in.
        afterMs: 5 * 16,
        assert: (scene) => {
          const standard = scene.getTestSnapshot().soldiers.find((s) => s.kind === "STANDARD");
          return [
            { label: "Melee soldier answers the call", pass: standard?.respondingToCall === true, detail: `responding=${standard?.respondingToCall}` },
            { label: "Enters from off-screen right", pass: (standard?.x ?? 0) > WORLD.width, detail: `x=${standard?.x.toFixed(0)} viewport=${WORLD.width}` },
          ];
        },
      },
      {
        // ~3.5s to walk the 240px in at SOLDIER.speed — far longer than the
        // 1.2s RECOVERING window that summoned it, which is the point.
        afterMs: 270 * 16,
        assert: (scene) => {
          const s = scene.getTestSnapshot();
          const standard = s.soldiers.find((sol) => sol.kind === "STANDARD");
          const rifleman = s.soldiers.find((sol) => sol.kind === "RIFLEMAN");
          return [
            {
              label: "Charge outlives the call (Rifleman recovered long ago)",
              pass: rifleman?.state === "ACTIVE",
              detail: `rifleman=${rifleman?.state}`,
            },
            {
              label: "Closes all the way into contact range of Emily",
              pass: standard !== undefined && Math.abs(standard.x - s.emily.x) <= COMBAT.contactRange,
              detail: `gap=${standard === undefined ? "n/a" : Math.abs(standard.x - s.emily.x).toFixed(0)} range=${COMBAT.contactRange}`,
            },
            { label: "Responding soldier landed a hit on Emily", pass: s.emily.hp < EMILY.maxHp, detail: `hp=${s.emily.hp}/${EMILY.maxHp}` },
          ];
        },
      },
    ],
  },
];
