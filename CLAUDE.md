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

- **Emily drives the game's movement; enemies move when there's a reason to.** The dynamics are meant to come from Emily's own positioning — she is the one who closes distance, and the player should feel that the fight moves because *they* moved. But enemies are not frozen in place, and there is no rule against moving them. They move when **reacting to the player's actions** or when **their enemy type calls for it**. What's still not wanted is *ambient* movement — idle patrol routes, wandering, chase-on-sight as a default behaviour — because that takes the initiative away from Emily and makes encounters happen to the player rather than being chosen by them. Motivated movement, not ambient movement.

  The infrastructure already exists and is already used: `Soldier.moveToward()` is a general method, and `GameScene.updateSoldierTargeting` already drives a melee soldier across the screen to guard a RECOVERING Rifleman that called for help. A new movement behaviour is a new call site plus (usually) an inert-by-default stat field, not a new system.

  (Historical note: an earlier version of this file stated flatly that enemies never reposition on their own. That was an early simplification, not a design pillar, and it has been retired — the original M1 spec in docs/FIRST_BUILD.md §"Soldier FSM" actually had ACTIVE soldiers move toward the nearest zombie within `detectRadius`. Ideas previously weighed against the stricter rule may deserve another look; see [#14](https://github.com/darkwebdev/zombie-emily/issues/14).)
- **The horde is uncapped — don't add a limit on follower count.** `HORDE_CAP` and `slotCost` are still in `tuning.ts` but are **decided against and slated for deletion** (see docs/PROGRESSION.md §1, approved on [#3](https://github.com/darkwebdev/zombie-emily/issues/3)); don't write new code that reasons about them. Nothing replaces them: no substitute budget, no headcount limit. Automatic fusion is already the compressor — 4 units become 1 at every tier, so the horde grows sub-linearly in the only currency that exists and never runs away. The one real ceiling is structural rather than designed: `TRAIL.bufferSize` (120) ÷ `TRAIL.spacingSamples` (6) ≈ **20 followers**, past which `BreadcrumbTrail.targetXForOffset`'s clamp makes every additional follower target the same oldest sample and pile up at one x. That's a documented threshold and a `?debug=1` diagnostic — **not a mechanic, and not a cap to enforce.**
- **Followers don't snap back to the trail after a fight.** `Follower.hasJoined` gates this — see its doc comment in `Follower.ts` for the exact semantics (it waits in place until Emily's position crosses back past it).
- **Verify live in the browser, not just `tsc`.** This project's history has repeatedly turned up real bugs that only showed up when watched running — see docs/TESTING.md's gotchas section for specific examples.

## Docs map

- **docs/TESTING.md** — the debug panel (`?debug=1`), its scripted demo scenarios, and the automated test suite that verifies real behavior against each one live. Read this before touching anything in `src/debug/`.
- **docs/FIRST_BUILD.md** — the original M1 design spec. Historical: several items it lists as "deferred" (the RECOVERING grace window, the defenseless damage multiplier, enemy variants, follower fusion) have since been built. Still useful for the original core-loop framing and tuning rationale; not a current-state reference — `tuning.ts` and the code are the source of truth for what's actually implemented.
- **docs/IDEAS.md** — unscoped backlog ideas, not yet designed or built. Pull one into an actual design pass (the `planner` subagent) before building it.
- **docs/PROGRESSION.md** — finalized decisions from the character-progression epic, [#15](https://github.com/darkwebdev/zombie-emily/issues/15), one section per approved decision. Decisions, not a changelog: a section landing there means the call is made and the issue is closed, and each section states separately whether its code change has happened yet. The rest of the epic is still under discussion in its issues; per the convention below, each closes as its decision lands here.

## Working conventions

- Design decisions with real gameplay/balance implications go through the `planner` subagent (Opus-backed, defined in `.claude/agents/planner.md`) via the `/planner` skill. Straightforward engineering doesn't need it.
- **Run subagents one at a time, never a parallel batch.** Five `planner` agents launched together once all hit the account's session rate limit and died mid-work, leaving issues created but their mandatory follow-up comments unposted — half-written state scattered across GitHub that had to be audited and repaired by hand. A partially-completed design pass is worse than a slow one: it produces output that looks finished but isn't, and you can't tell which parts to trust without checking every issue. So wait for each pass to finish before starting the next, and if a batch does get interrupted, audit the external state (`gh issue list --state all`, plus per-issue comment checks) before re-running anything, so a half-done pass isn't duplicated. Also don't delegate what the main session can just do — a few issue comments needing answers don't need a planner pass each.
- **The invariants documented here and in docs/FIRST_BUILD.md are this project's current decisions, not permanent laws.** Several were chosen for implementation simplicity in an early build, not as design pillars. The clearest precedent is one that has already been retired: "enemies never reposition on their own" was stated flatly in this file for months, was cited to reject or defer several ideas, and then turned out to be an early simplification the project no longer wanted — see the movement rule above. When a new idea conflicts with a documented invariant, don't reject it just because it contradicts existing text; work out which of these actually applies, and say which one explicitly:
  - **Deprioritize** — the idea is fine, it just needs foundation this project doesn't have yet.
  - **Revise the rule** — the idea is good enough that the invariant itself should change; say so, and where it needs updating.
  - **Reject on the merits** — rare: the idea's actual cost (what breaks, what gets harder) genuinely outweighs its value, argued concretely — never "rejected because it conflicts with an existing rule" on its own.
- **"This breaks balance" is not by itself a reason to reject or restrict an idea — in either direction.** Enemy kinds and follower kinds are both just entries in a `Record<Kind, StatsShape>` (see "The stats pattern" above), so balance is something this project can fix by adding content to the other side of the fight, not only by weakening or gating the new thing. A follower that would be overpowered against the current enemy roster, or an enemy that would be overkill against the current follower roster, doesn't need to be nerfed or shelved — the generative answer is usually a paired addition on the other side: a new enemy that specifically challenges what the strong follower is good at, or a new follower (or ability) that's specifically the answer to the dangerous enemy. This runs the same logic as the rule that a special follower should answer pressure that already exists (see docs/PROGRESSION.md and the character-progression epic), just allowing the pressure and its answer to be designed and shipped together in either order, rather than treating "nothing on the other side justifies this yet" as a reason to shelve a strong idea.
- **Two abilities looking similar — between followers, or between a follower and Emily — is not a reason to reject one either.** Discuss alternatives that differentiate them instead of defaulting to "these overlap, so defer or cut one." (There's already a case on record this applies to: PORTER and SPITTER were both flagged as letting Emily skip walking into contact — on revisit, the fix should be finding each a distinct niche, not leaving one deferred indefinitely because of the overlap.) Redundancy is a prompt to design a distinguishing detail, not a verdict.
- Never hardcode a balance number outside `tuning.ts`.
- When adding or changing gameplay behavior, add or update the matching demo + test in `src/debug/` (docs/TESTING.md) rather than only hand-testing once and moving on.

### Where design work lives: discussions in issues, decisions in docs

- **Discussions go in GitHub issues, one topic per issue.** When a design pass produces a lot of material, split it into separate issues rather than leaving it in a chat log or piling it into one omnibus issue. A long single thread can't be scanned — one topic per issue means you can hold one thing at a time and come back to the rest independently. Cross-link related issues so the set stays navigable on its own.
- **Issues exist so a long design conversation doesn't have to be navigated as one hard-to-scroll chat thread. Comments are how feedback and follow-up questions get added to that conversation after the issue is opened.** When the user asks a question in an issue comment, answer it there, not only in chat — see "Who's commenting" below for how. Answering only in chat recreates the exact navigation problem issues exist to solve. Before doing any further work on an issue, check its comment thread for unanswered questions and answer them first.
- **Finalized decisions go in documents** — the `docs/` tree, or this file. The issue holds the debate and the options; once a call is actually made, the outcome belongs in a doc so it's discoverable without reading issue history.
- **An issue may be closed only after its decision is finalized in a doc, and that doc is referenced from CLAUDE.md or the other docs.** Shipping the code is not on its own grounds to close an issue — the decision has to be written down and linked where a reader will find it. Every issue should carry an explicit closing condition naming the document that has to exist first.
- **When the user approves an issue's decision (e.g. by commenting approval on it), write that decision into its doc via the `planner` subagent, then close the issue** — don't leave finalization for later or do the doc-writing directly in whatever model the session happens to be running. This is the same "design decisions go through planner" rule above, applied to the step that actually lands the decision permanently, since that write is exactly as consequential as the design work that produced it.
- **Unscoped ideas start in `docs/IDEAS.md`, filed via `/save-idea`.** When the user drops a new idea mid-conversation, use `/save-idea` rather than writing it up inline — it spawns a background subagent that cross-references existing issues and files the entry, so capturing an idea doesn't interrupt whatever's currently in progress. When the backlog there needs clearing out, run `/triage-ideas` — it sends each idea through the `planner` subagent and turns the result into GitHub issues per the rules above. Both are manual-trigger only; nothing runs either automatically.

#### Who's commenting

Both the user and the coding agent use the same GitHub account for `gh` commands in this repo, so a plain `gh issue comment` from the agent would be indistinguishable from the user's own words — which breaks the "comments outrank the issue body" rule, since there'd be no way to tell whose comment is whose. **Agent comments on issues go through the `.github/workflows/agent-comment.yml` workflow instead**, so they post as `github-actions[bot]` — a distinct account with its own badge in the GitHub UI — rather than as a text convention that's easy to forget or miss:

```
gh workflow run agent-comment.yml -f issue=<number> -f body="<markdown body>"
```

It's manual-trigger only (`workflow_dispatch`), never automatic. Confirm the comment landed with `gh api repos/<owner>/<repo>/issues/<number>/comments` after a few seconds, since `gh workflow run` doesn't return the comment itself.
