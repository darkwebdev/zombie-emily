# Testing

Zombie Emily has no traditional unit-test runner. Correctness is verified two ways, both against the same real, running Phaser scene — never a mock.

## The debug panel

Append `?debug=1` to the dev URL (`src/main.ts` mounts `DemoPanel` only then). It gives you:

- A collapsible tree of buttons (`src/debug/demos.ts`'s `DEMOS` array — 26 as of this writing), each dropping the live scene into one specific, hand-built scenario (e.g. "a soldier already paralyzed and in contact range," "four base followers about to auto-fuse") via `GameScene.runDemo(name)` → `scene.restart()` → `GameScene.applyDemo(name)` (the big switch in `GameScene.ts`). Every click restarts the scene from a clean slate first — demos never stack on top of each other's leftover state, and each demo spawns only the characters it actually needs, not the full level.
  - The branches are `DEMO_GROUPS` in the same file; the order there is the order on screen, and branches start collapsed. A flat column of 26 buttons meant reading every label to find one. `"reset"` is the one demo outside the tree — it's the clean-slate action rather than a scenario, so it sits with the test runner at the top. **Every other demo must appear in exactly one branch**: an assertion at the bottom of `demos.ts` throws at import time if a newly added demo is left ungrouped or listed twice, so the tree can't quietly fall out of sync with `DEMOS`.
  - Expansion state lives in the DOM, and the panel is mounted once per page load, so an open branch survives the `scene.restart()` that running a demo triggers.
- Clicking a demo also runs whatever test(s) cover that exact scenario, automatically, live, against that same on-screen playthrough (see "Live mode" below).
- A "▶ Run All Tests" button that instantly sweeps every test in the suite (see "Batch mode" below).
- A "☐ Hitboxes" toggle for Arcade Physics' body outlines (the rectangle drawn over every character). It's **off by default** — now that Emily is drawn from real art, a box permanently pinned over her reads as part of the character rather than as a debug overlay. Start with it already on via `?debug=1&hitboxes=1`. The flag lives in `src/debug/hitboxes.ts` at module level, not on the scene, because every demo click restarts the scene; `GameScene.create()` calls `applyHitboxes(this)` to re-apply it after each restart.
- `window.__game`, the live `Phaser.Game`. Mounting the panel sets it, so it exists under `?debug=1` and nowhere else. It's the only way to reach the running scene from outside the bundle — Phaser keeps no global registry of game instances — which is what makes the "verify live in the browser" rule scriptable: drive real keystrokes over CDP and read `window.__game.scene.getScene("game").getTestSnapshot()` back. That's how the arrow-keys-walk / `↑`-throws behaviour was checked, rather than by eyeballing a screenshot (the walk and idle frames are hard to tell apart in a still).

## The test suite (`src/debug/tests.ts`)

One or more `TestCase` per demo (`TESTS: TestCase[]` — 32 cases across the 26 demos as of this writing). Shapes:

```ts
interface Check { label: string; pass: boolean; detail?: string }
interface Checkpoint { afterMs: number; assert: (scene: GameScene) => Check[] }
interface TestCase { demo: DemoName; name: string; run?: (scene: GameScene) => void; checkpoints: Checkpoint[] }
```

- A `Check` is one concrete, named fact — not a single pass/fail per test. Every test asserts several, each independently visible.
- A `Checkpoint` is a point in real time (`afterMs` after the previous checkpoint, or after `run()` for the first one) where some checks become meaningful. Splitting a test into checkpoints lets a multi-stage scenario (e.g. RECOVERING at the start, ACTIVE 1.2s later) report each fact exactly when it becomes true on screen, instead of bundling everything into one assertion fired only at the end.
- `run()` fires once, right after the demo's own setup, for anything that needs simulating (pressing Space, throwing a limb) rather than being part of the demo's initial state. Use `scene.debugThrowLimb()` for a real throw (real ammo cost, real launch velocity — the same code path the `↑` key uses) and `scene.debugSpawnLimb(x, y, velX)` only when the test specifically needs an arbitrary hit direction/velocity a real throw couldn't produce (e.g. a Shield Trooper's frontal-deflect test).
- `single(steps, assert)` in `tests.ts` is the shorthand for the common one-checkpoint case (`steps` frames at 16ms each after `run()`).

A demo can carry more than one `TestCase` when proving a second claim needs a different starting action from the same setup — e.g. "Recovering" has one test proving the natural RECOVERING → ACTIVE timeout, and a second, independently-restarted test proving a limb thrown mid-window re-paralyzes it instead of letting it recover.

### Live mode (clicking a demo button) — `DemoPanel.runDemoWithTests`

Applies the demo once, then lets **Phaser's own real frame loop** animate it — no manual stepping. Each checkpoint's `assert()` fires against the live scene at the real moment its `afterMs` has actually elapsed, so what a check reports is exactly what just happened on screen, not a snapshot from a decoupled fast-forwarded simulation. Every check this run will ever produce is laid out immediately as a pending row (`…`); each row only ever flips its own icon in place when its checkpoint resolves — the list itself never grows or reorders mid-run. When a demo carries more than one `TestCase`, each one after the first gets the demo re-applied fresh before it runs, so two tests never contaminate each other's state (see the `ti > 0` branch in `runDemoWithTests`).

### Batch mode (the "Run All Tests" button) — `TestRunner.runTests` / `runAllTests`

Drives every test by manually stepping `game.loop.step()` in a tight loop — instant, not meant to be watched. Good for a full regression sweep in a couple of seconds. Not used for the per-demo interactive flow because it doesn't reflect real on-screen timing.

## Adding a new demo + test

1. Add an entry to `DEMOS` in `demos.ts` (`name`, `label`, `description`).
2. Add a `case` to `applyDemo()` in `GameScene.ts` that spawns only what that scenario needs.
3. Add one or more `TestCase`s in `tests.ts` with `demo` matching the new name.
4. **For each check, ask: "if I deliberately broke this behavior, would this specific check catch it?"** A check that can't fail regardless of correctness — wrong distance so contact never actually happens, a window too short to observe the real transition, a bare count instead of checking which entities/kinds — is worse than no check at all, because it's false confidence. See the gotchas below; this exact class of bug has bitten this project more than once.
5. Run `npx tsc --noEmit`, then verify live: click "▶ Run All Tests" and confirm the pass count, then click the individual new demo button and watch it resolve for real.

## Gotchas

All of these cost real debugging time to find — don't rediscover them.

- **A synthetic setup can silently fail to exercise the real claim.** The "paralyze" test originally spawned the soldier 40px from Emily (contact range is 16px, `COMBAT.contactRange`) and asserted "no damage" — the check passed identically whether or not paralysis actually suppressed contact damage, because Emily was never close enough to be hit in the first place. Always double-check the spatial/timing preconditions actually make a check capable of failing.
- **A window can run long enough to hit an unrelated auto-transition.** The "death" test's assertion window originally ran past `triggerDeath()`'s 1.2s auto-restart-after-fade (`GameScene.triggerDeath`), which silently reset the whole level (`isGameOver` back to `false`) before the assertion ever ran — making the test fail for a reason that had nothing to do with the mechanic it claimed to check.
- **A tab with `document.hidden === true` fully freezes Phaser's `requestAnimationFrame` loop.** This can happen in headless/automated browser contexts (it's not something a real user ever hits). Real timers (`setTimeout`) still fire, but `game.loop.frame` never advances, so live mode (which depends on real frame ticks) hangs forever. Batch mode (manual `game.loop.step()`) works regardless of tab visibility and is the fallback for verifying in such an environment — check `document.hidden` before assuming a hang is a real product bug.
- **Two `scene.restart()` calls queued without a frame in between can race.** Phaser's `SceneManager` processes a queued restart at the start of the next frame; firing a second `runDemo()` before that frame has happened (e.g. two rapid scripted clicks with no real tick between them) can leave `pendingDemo` inconsistent. Real user clicks are always far enough apart in wall-clock time for this not to matter — it only bites scripted verification.
- **A numeric comparison against a value that's still changing can't use strict equality.** E.g. "aggro spent in one go" checks `< 0.05`, not `=== 0`, because a few settle frames of natural fill-rate regen pass between activation and the assertion running.
- **`WORLD.groundY` is not the ground.** It's Emily's *centre* y; the floor her feet stand on is `GROUND_LINE` (`WORLD.groundY + bodyHeight/2`). A missed limb used to be "landed" at `y >= WORLD.groundY` and so came to rest half a body height above the street, hanging in mid-air. Anything that has to sit *on* the ground must measure its own bottom edge against `GROUND_LINE`.
- **Setting `x`/`y` on an Arcade sprite is undone by its own body.** The body writes its position back onto the sprite every step, so `setY()` on a physics object silently reverts on the next frame. Use `body.reset(x, y)` to move both. This is what made the limb's landing snap look like it wasn't running at all.
- **Reading a physics sprite's position in `preUpdate` gives you last frame's value.** The body updates the sprite *after* the scene updates, so anything that visually tracks a moving physics object (the limb's overhead marker) must hook `Phaser.Scenes.Events.POST_UPDATE` instead, or it trails visibly behind.
- **`handleLimbHits` ignores a soldier that is already PARALYZED**, so a test that throws at a pre-paralyzed target (e.g. the "paralyze" demo) will see the limb sail straight past instead of sticking. Anything about stuck limbs needs an ACTIVE (or RECOVERING) soldier — that's why "limbAutoPickup" spawns its own rather than reusing "paralyze".
- **An Arcade body's `width`/`height` read back in world units, but `setSize()` takes source-texture pixels.** Characters are drawn from art authored 3x oversized and scaled back down, so the two differ by exactly that factor. The `artRoster` test was written asserting `body.width * renderScale` and reported every hitbox at a third of its real size before the units were pinned down.
- **Art must never decide a hitbox.** `applyCharacterArt` sets each enemy/follower body explicitly from `CHARACTER_ART.hitbox` and seats it bottom-centred on the ground line, rather than letting it default to the frame bounds — the figures are all wider than their boxes (the Brute is drawn nearly 5x its hitbox width) and letting the silhouette become the body would silently rewrite every range check in the game.
