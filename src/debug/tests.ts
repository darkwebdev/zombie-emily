import Phaser from "phaser";
import { CHARACTER_ART, COMBAT, EMILY, EMILY_SPRITE, FOLLOWER, GROUND_LINE, LIMB, RIFLEMAN, SHIELD_TROOPER, SOLDIER, WORLD } from "../config/tuning";
import { EMILY_ANIM } from "../entities/Emily";
import { SPAWNS } from "../levels/level1";
import { touchInput } from "../systems/touchControls";
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
        // The figures are all different sizes and none of them is the size of
        // its hitbox, so both of these would break silently the moment the
        // art is re-exported at a different height or a kind is added without
        // a hitbox entry: the sprite would either float/sink or quietly start
        // fighting with a box the size of its silhouette.
        checks.push({
          label: `${entity.kind}: feet on the ground line`,
          pass: Math.abs(entity.y + (1 - entity.originY) * entity.displayHeight - GROUND_LINE) < 0.5,
          detail: `bottom=${(entity.y + (1 - entity.originY) * entity.displayHeight).toFixed(1)} groundLine=${GROUND_LINE}`,
        });
        checks.push({
          label: `${entity.kind}: hitbox is still ${box.width}x${box.height}, bottom-centred on it`,
          pass:
            // body.width/height read back in world units: setSize takes
            // source-texture pixels, but Arcade stores them scaled.
            Math.abs(body.width - box.width) < 0.01 &&
            Math.abs(body.height - box.height) < 0.01 &&
            Math.abs(body.x + body.width / 2 - entity.x) < 0.5 &&
            Math.abs(body.y + body.height - GROUND_LINE) < 0.5,
          detail: `w=${body.width.toFixed(1)} h=${body.height.toFixed(1)} cx=${(body.x + body.width / 2).toFixed(1)} x=${entity.x.toFixed(1)} bottom=${(body.y + body.height).toFixed(1)}`,
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
