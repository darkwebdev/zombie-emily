import { COMBAT, EMILY, FOLLOWER, HORDE_CAP, LIMB, RIFLEMAN, SHIELD_TROOPER, SOLDIER, WORLD } from "../config/tuning";
import { SPAWNS } from "../levels/level1";
import type { DemoName } from "./demos";
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

/** At least one test per demo in demos.ts — each drives that exact scenario
 * and checks several concrete, behavioral facts, not just a single combined
 * boolean. A few demos carry two tests, because proving a second claim needs
 * a different starting setup (e.g. a limb thrown at the same soldier can
 * either be watched recovering OR be re-paralyzed, not both in one run). */
export const TESTS: TestCase[] = [
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
    demo: "hordeCap",
    name: "Horde cap blocks a conversion once slots are full",
    checkpoints: single(200, (scene) => {
      // The Brutes engage and kill the paralyzed soldier on their own
      // (~0.5s), then 1.0s convert + margin.
      const s = scene.getTestSnapshot();
      return [
        { label: "No 9th slot added (still 4 Brutes)", pass: s.followers.length === 4, detail: `followers=${s.followers.length}` },
        {
          // The cap is a slot budget, not a headcount — 4 Brutes x 2 slots
          // is what makes this exactly full, so that's what to assert.
          label: `Slot budget still exactly full (${HORDE_CAP}/${HORDE_CAP})`,
          pass: s.followers.reduce((sum, f) => sum + f.stats.slotCost, 0) === HORDE_CAP,
          detail: `slots=${s.followers.reduce((sum, f) => sum + f.stats.slotCost, 0)}`,
        },
        { label: "Soldier still consumed despite the block", pass: s.soldiers.length === 0, detail: `soldiers=${s.soldiers.length}` },
        {
          label: "Roster unaffected (all still Brutes)",
          pass: s.followers.every((f) => f.kind === "BRUTE"),
          detail: `kinds=[${s.followers.map((f) => f.kind)}]`,
        },
      ];
    }),
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
        {
          // 4 base followers (4 slots) collapsing into one Brute (2 slots)
          // is what makes fusion the pressure valve on HORDE_CAP.
          label: "Fusion freed slots (4 -> 2)",
          pass: s.followers.reduce((sum, f) => sum + f.stats.slotCost, 0) === 2,
          detail: `slots=${s.followers.reduce((sum, f) => sum + f.stats.slotCost, 0)}`,
        },
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
