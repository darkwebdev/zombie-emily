# Zombie Emily

2D pixel-art side-scroller. Emily (a zombie girl) throws body parts to paralyze soldiers; her horde of followers eats/converts paralyzed or killed soldiers into more followers, forming a breadcrumb-trail conga line behind her.

## Stack & running it

TypeScript + Phaser 3 (Arcade Physics) + Vite. No build-time asset pipeline — all art is runtime-generated colored shapes via `Graphics.generateTexture()`, no image assets.

```
npm install
npm run dev
```

`vite.config.ts` requests port 5173, but Vite auto-picks the next free port if that's taken — check the terminal output for the actual URL. Append `?debug=1` to open the debug panel (see **docs/TESTING.md**) and enable Arcade Physics debug draw.

`npm run build` runs `tsc -b` then builds. After any change, run `npx tsc --noEmit` — but that only proves the code compiles. **Verify behavior live in the browser**, not just via the type checker; see "Working conventions" below.

## Core loop

Throw a limb (`J`) → it paralyzes a soldier on hit → a follower (or Emily, by standing on it) kills/converts it → the corpse becomes a new follower → once the aggro meter is full, press `Space` to send the whole horde rushing the nearest soldier.

## Architecture at a glance

- `src/main.ts` — boots the single Phaser scene, mounts the debug panel when `?debug=1`.
- `src/scenes/GameScene.ts` — the one scene. Owns every entity array and system instance, drives them in a fixed order each frame (see below), and is where gameplay rules actually live — the systems in `src/systems/` are mostly stateless/data-in-data-out; `GameScene` calls them and applies the results.
- `src/entities/` — `Emily`, `Soldier`, `Follower`, `Limb`, `Bullet`. All `Phaser.Physics.Arcade.Sprite` subclasses.
- `src/systems/` — `CombatSystem` (bidirectional contact damage), `AggroSystem` (the rush burst), `GunfireSystem` (Rifleman bullets), `BreadcrumbTrail` (the conga-line follow logic), `Hud`, `ParallaxBackground`. Plain classes `GameScene` owns and calls directly — no ECS, no object pooling (~30 entities max, doesn't need it).
- `src/config/tuning.ts` — **single source of truth for every balance number.** Change behavior here, not by hardcoding values elsewhere.
- `src/levels/level1.ts` — hand-placed enemy spawns for the one level.
- `src/debug/` — the debug panel and automated test suite. See **docs/TESTING.md** — read it before touching anything here.

### The stats pattern (how enemy/follower variants work)

`Soldier` and `Follower` are never subclassed per variant. Each carries a `kind` (`EnemyKind` — `STANDARD`/`SHIELD`/`RIFLEMAN`, or `FollowerKind` — `BASE`/`BRUTE`) and a `stats` object pulled from a `Record<Kind, StatsShape>` in `tuning.ts` (`ENEMY_STATS`, `FOLLOWER_STATS`). Adding a new variant means adding a stats entry and a `case` in the relevant switch statements (`GameScene.applyDemo`, texture/tint lookups), not a new class. `Soldier`'s ranged-weapon fields (`fireRange`, `aimDuration`, `bulletDamage`, etc.) are inert (`0`) unless a variant sets them — that's the entire difference between `RIFLEMAN` and `STANDARD`/`SHIELD`.

### Update order (`GameScene.update()`)

Feed → input/movement/throw → Emily tick → breadcrumb trail → aggro → followers (rush / autonomous engage / join-trail) → soldier targeting → soldiers → gunfire → combat → conversions → fusion check → limbs (hits, falling, pickup) → background parallax → HUD → death/cleared checks. Aggro runs before followers so a burst pressed this frame takes effect this frame; conversions run after combat so a kill resolved this frame starts converting immediately.

### Things every change should respect

- **Enemies never reposition on their own.** Soldiers only turn to face threats and fight on contact — no patrol, no chase. The one deliberate exception is a melee soldier answering a Rifleman's call for help (`Soldier.moveToward`, used only from `GameScene.updateSoldierTargeting`). All movement dynamics are meant to come from Emily's own movement, not the enemies'.
- **The horde cap (`HORDE_CAP` in `tuning.ts`) is a slot budget, not a headcount.** A base follower costs 1 slot, a Brute costs 2 (`stats.slotCost`). Always sum `slotCost`, never use `followers.length`, when reasoning about the cap.
- **Followers don't snap back to the trail after a fight.** `Follower.hasJoined` gates this — see its doc comment in `Follower.ts` for the exact semantics (it waits in place until Emily's position crosses back past it).
- **Verify live in the browser, not just `tsc`.** This project's history has repeatedly turned up real bugs that only showed up when watched running — see docs/TESTING.md's gotchas section for specific examples.

## Docs map

- **docs/TESTING.md** — the debug panel (`?debug=1`), its scripted demo scenarios, and the automated test suite that verifies real behavior against each one live. Read this before touching anything in `src/debug/`.
- **docs/FIRST_BUILD.md** — the original M1 design spec. Historical: several items it lists as "deferred" (the RECOVERING grace window, the defenseless damage multiplier, enemy variants, follower fusion) have since been built. Still useful for the original core-loop framing and tuning rationale; not a current-state reference — `tuning.ts` and the code are the source of truth for what's actually implemented.
- **docs/IDEAS.md** — unscoped backlog ideas, not yet designed or built. Pull one into an actual design pass (the `planner` subagent) before building it.

## Working conventions

- Design decisions with real gameplay/balance implications go through the `planner` subagent (Opus-backed, defined in `.claude/agents/planner.md`) via the `/planner` skill. Straightforward engineering doesn't need it.
- Never hardcode a balance number outside `tuning.ts`.
- When adding or changing gameplay behavior, add or update the matching demo + test in `src/debug/` (docs/TESTING.md) rather than only hand-testing once and moving on.
