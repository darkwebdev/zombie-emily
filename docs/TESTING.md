# Testing

Zombie Emily has no traditional unit-test runner. Correctness is verified two ways, both against the same real, running Phaser scene — never a mock.

## The debug panel

Append `?debug=1` to the dev URL (`src/main.ts` mounts `DemoPanel` only then). It gives you:

- A vertical stack of buttons (`src/debug/demos.ts`'s `DEMOS` array — 20 as of this writing), each dropping the live scene into one specific, hand-built scenario (e.g. "a soldier already paralyzed and in contact range," "four base followers about to auto-fuse") via `GameScene.runDemo(name)` → `scene.restart()` → `GameScene.applyDemo(name)` (the big switch in `GameScene.ts`). Every click restarts the scene from a clean slate first — demos never stack on top of each other's leftover state, and each demo spawns only the characters it actually needs, not the full level.
- Clicking a demo also runs whatever test(s) cover that exact scenario, automatically, live, against that same on-screen playthrough (see "Live mode" below).
- A "▶ Run All Tests" button that instantly sweeps every test in the suite (see "Batch mode" below).

## The test suite (`src/debug/tests.ts`)

One or more `TestCase` per demo (`TESTS: TestCase[]` — 23 cases across the 20 demos as of this writing). Shapes:

```ts
interface Check { label: string; pass: boolean; detail?: string }
interface Checkpoint { afterMs: number; assert: (scene: GameScene) => Check[] }
interface TestCase { demo: DemoName; name: string; run?: (scene: GameScene) => void; checkpoints: Checkpoint[] }
```

- A `Check` is one concrete, named fact — not a single pass/fail per test. Every test asserts several, each independently visible.
- A `Checkpoint` is a point in real time (`afterMs` after the previous checkpoint, or after `run()` for the first one) where some checks become meaningful. Splitting a test into checkpoints lets a multi-stage scenario (e.g. RECOVERING at the start, ACTIVE 1.2s later) report each fact exactly when it becomes true on screen, instead of bundling everything into one assertion fired only at the end.
- `run()` fires once, right after the demo's own setup, for anything that needs simulating (pressing Space, throwing a limb) rather than being part of the demo's initial state. Use `scene.debugThrowLimb()` for a real throw (real ammo cost, real launch velocity — the same code path the `J` key uses) and `scene.debugSpawnLimb(x, y, velX)` only when the test specifically needs an arbitrary hit direction/velocity a real throw couldn't produce (e.g. a Shield Trooper's frontal-deflect test).
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
