# Rendering & draw order — finalized decisions

Running record of decisions about how the game is *drawn* — depth layering,
draw order, and on-screen legibility — as each one is approved. One section
per decision, added as it lands; the issue holds the debate, this file holds
the outcome.

> **These are decisions, not a changelog.** A section here means the call has
> been made and the issue is closed — **not** necessarily that the code has
> been changed. Each section says explicitly what state its implementation is
> in. `src/config/tuning.ts` and the code remain the source of truth for what
> the game currently does; every number below is named by the constant it
> comes from, so nothing here can drift from tuning without the name going
> stale too.

---

## 1. Horde legibility: a one-sided depth band, feet-line draw order, and body-width horizontal spread

**Decided** — approved on
[#31](https://github.com/darkwebdev/zombie-emily/issues/31).
**Implementation: done** — landed in d587028, revised in 18a5b9c (the band
made one-sided, `CHARACTER_FRONT_DEPTH` added), with the engage-path amendment
in d2be910. `HORDE_SPREAD`, `CHARACTER_FRONT_DEPTH` and `PROJECTILE_DEPTH` are
in `tuning.ts`; `Follower` carries `depthOffset`/`xJitter`;
`applyCharacterArt` takes a per-figure `groundLine`; the `hordeSpread` demo
and its test in `src/debug/` are the guard.

### The problem

Followers stacked into a single silhouette and the player could not read their
own horde size — which matters, because the horde *is* the resource the whole
loop accumulates. Three causes, verified in code at the time:

1. **No depth sorting at all.** No character called `setDepth()`, so draw
   order was creation order. A follower spawned later painted over an earlier
   one regardless of where either stood, so even slightly-overlapping figures
   merged — inconsistently, which is worse than consistently.
2. **Every follower shared one Y line.** Nothing set a follower's Y after
   construction; all sat at `WORLD.groundY` plus their kind's `spawnYOffset`.
   When Emily stops they settle into their deadzones on that one line and
   overlap.
3. **The >20 pile-up** (`TRAIL.bufferSize` ÷ `TRAIL.spacingSamples`, i.e.
   `TRAIL_DEGENERATION_THRESHOLD`), where the trail clamp hands every further
   follower the same oldest sample and they become literally co-located. Rare,
   and deliberately left alone — see "What was not changed" below.

The everyday symptom (3–5 followers reading as one blob) is (1)+(2). Depth
sorting is the bigger half: without it, a figure standing visibly *behind*
another can still paint over it.

### The mechanism as built

Per-follower, seeded once at construction, fixed for life:

- **`HORDE_SPREAD` in `tuning.ts`** is the single source of truth:
  `yBand` (how far down the street a follower may stand), `offsets` (the
  vertical table), `xOffsets` (the horizontal table). Nothing about the spread
  is hardcoded anywhere else.
- **Seed:** `GameScene.nextFollowerSeed()`, a monotonic per-run counter
  (`followerSpawnSeq`) reset in the scene's own setup. Every spawn path —
  conversion, fusion, debug spawn — pulls the next seed.
- **Vertical placement:** `depthOffset = HORDE_SPREAD.offsets[seed % len]`.
  The `Follower` constructor takes the *canonical* ground Y and adds
  `stats.spawnYOffset + depthOffset` itself, so no caller has to know about
  either.
- **The art is seated on the follower's own line.** `applyCharacterArt` takes
  a `groundLine` parameter and followers pass `GROUND_LINE + depthOffset`.
  This is load-bearing, not tidiness: `originY` is solved *from* the ground
  line, so seating against the global line would cancel the Y offset out
  exactly — the sprite's `y` would move and the drawn figure would not.
- **Depth sort by feet line**, set once at construction (Y never changes
  afterwards): `setDepth(depthOffset + seed * 1e-4)`. The offset is the sort
  key; the seed epsilon is a deterministic tie-break between two followers
  sharing an offset value, so no two followers can share a depth and hide
  inside each other.
- **Horizontal spread:** a constant per-follower
  `xJitter = HORDE_SPREAD.xOffsets[seed % len]`, added to the **trail-follow
  target only** (`followTarget(trail.targetXForOffset(...) + f.xJitter)`). A
  fixed constant, never re-rolled per frame — re-rolling makes the follower
  vibrate in place.
- **Deterministic, never `Math.random()`.** The live suite in
  `src/debug/tests.ts` asserts against the running scene; an offset re-rolled
  each run would make every position-sensitive case flaky. Seeded tables look
  scattered, are stable per follower, and reproduce run to run.

`checkFusion` had to change with this: the fused Brute is spawned at the
averaged **x** of the consumed followers but at the canonical `WORLD.groundY`,
*not* their averaged y — that average already contains their depth offsets, so
using it would double-count them. The Brute is a new figure and draws a fresh
seed like any other spawn.

### Amendment 1 — the horizontal offset had to be body-width scale, not "small"

The original proposal had ±4px of x-jitter as a *secondary* touch, with the
depth band doing the real work. That is not how it played. At ±4px the horde
still drew as a single blob on screen **while all 33 tests passed green**.

Two reasons, both worth keeping:

1. **When Emily stands still, every trail sample is her same x**, so the
   entire conga line collapses onto one point. The depth band stops the
   figures occluding each other; it does not un-stack them.
2. **4px is about a fifth of a body width** (a base follower is ~22px wide, a
   Brute ~31px), so it is simply not visible at play scale.

Final: `HORDE_SPREAD.xOffsets` is body-width scale
(`[0, 13, -7, 20, -17, 6, -13]`), giving a resting horde roughly 36px of
spread. Verified in a browser: eight followers rest at distinct x positions and
are individually countable, and the line still reads as a trail rather than a
scatter while she is walking.

**The tension worth recording:** `docs/PROGRESSION.md` §1 derives rank spacing
at ~34px (`trailSpacing` × `TRAIL.sampleIntervalMs` × `EMILY.speed`), so the
horizontal jitter is now the *same order as the spacing between ranks itself*.
That is knowingly accepted — it looked right both moving and stopped — but it
means the two numbers are coupled: a large change to either should be looked
at against the other, in a browser, not in the abstract.

### Amendment 2 — the band is one-sided, and Emily/soldiers deliberately draw in front

The first version banded symmetrically around `GROUND_LINE`, on the assumption
that the line is the middle of the road. **It is not.** The `bg-ground`
parallax layer is drawn *starting at* `GROUND_LINE` and runs downward to the
bottom of the viewport, so `GROUND_LINE` is the road's **back edge** and there
is no road above it. Every follower that drew a negative offset stood a few
pixels above the tarmac, on the fence — reported in play as *"they sometimes
hang in the air now, ignoring the floor texture limits."*

Final: offsets run `0..HORDE_SPREAD.yBand` — **forward, toward the camera,
only**. A follower can only ever stand further down a road that is really
there.

**Knock-on, and it is a real design call, not a detail.** With a one-sided
band, Emily and the soldiers — who stand on the canonical line — are now at
the very *back* of it, so sorting strictly by feet line would have every
follower paint over both. Both are instead drawn in front of the whole horde
via `CHARACTER_FRONT_DEPTH` (derived as `HORDE_SPREAD.yBand + 1`, so it tracks
the band automatically). This is a deliberate lie about depth, at most
`yBand` px deep, and it is justified: Emily and a soldier are the two figures
whose state has to stay readable at a glance — **Emily because she is the one
being aimed at, a soldier because its paralyze and aim tints are the entire
tell** that the loop runs on. A soldier buried under a swarm hides exactly the
information the player is reading the swarm to act on.

**Why the test didn't catch the floating followers:** it asserted
`abs(offset) <= yBand`, which a floating follower passes happily. It now
checks the *sign*, and additionally that every follower's feet land between
the street texture's own top and bottom edges — read off the loaded texture
rather than from a second copy of the number, so the assertion cannot drift
from the art.

### Amendment 3 — an engaging follower steers at a flank slot, not the soldier's exact x

The original rationale for "jitter is trail-only" said that a rushing or
engaging follower converges on the soldier's *real* x, so ganging up isn't
degraded by scatter. [#32](https://github.com/darkwebdev/zombie-emily/issues/32)
(follower surround) changed that: an engaging follower now takes a side slot at
`soldier.x ± stats.flankStandoff` plus a small in-slot nudge from
`FLANK.sideJitter`.

The amended rationale, which is all of #32 that belongs in *this* decision: a
fighting follower converges on a **deliberate slot rather than a scattered
one**, and the slot is bounded by

```
flankStandoff + deadzone + max|FLANK.sideJitter| <= sqrt(reach² − dy²)
```

with `dy` the worst-case `HORDE_SPREAD` offset — the inequality that keeps
every flanker inside its own bite range (the worked arithmetic for each kind
is in the comments on `FOLLOWER.flankStandoff` and `BRUTE.flankStandoff`).
So ganging up is provably not degraded, and the wide `xOffsets` table stays
trail-only: it is far too wide to use in a fight without pushing followers out
of range of what they are biting.

The depth band, the seeded non-`rank` offsets and the feet-line sort are all
reused unchanged by the surround work — the band is also what makes a follower
crossing *behind* a soldier read correctly. **#32's own decision is not
recorded here**; this is only the one-line amendment to #31's rationale, plus
the cross-reference.

### Why the seed is a scene-owned spawn counter, and explicitly not `rank`

- **Not `rank`.** `rank` decrements when a follower ahead of you dies or fuses
  (`GameScene.removeFollower` renumbers everyone behind). A rank-derived
  offset would therefore make the entire tail **pop vertically mid-fight**,
  every time anyone died — the most motion, at the worst moment. The seed is
  fixed at construction and never re-derived.
- **Scene-owned, not module-static.** Every demo button restarts the scene. A
  static counter would carry across restarts and hand the same scenario
  different offsets on each run, which would make the live tests
  unreproducible. `followerSpawnSeq` is scene state and resets with the scene.

### Why the tables are hand-written scrambles of coprime lengths

The first attempt used `jitter * (((seed*2+1) % (len*2)) / len - 1)` — which
*reads* like a hash and is in fact a straight linear ramp correlated with
spawn order. The horde lined up into a neat staircase. The tables are now
explicit, integer, hand-scrambled, and trivially testable.

Their lengths are **deliberately different and coprime** (`offsets` 10,
`xOffsets` 7, and `FLANK.sideJitter` 5 alongside them) so they do not cycle in
lockstep: 10 × 7 gives 70 distinct (x, depth) positions before any two
followers can land on the same spot.

### The depth layering, as actually built

Every explicit depth in the game, back to front. This table is the reason
`PROJECTILE_DEPTH` and `CHARACTER_FRONT_DEPTH` exist as *named* constants:
the band only works if everything else stays out of it.

| Depth | What | Where |
| --- | --- | --- |
| −100 / −90 / −80 / −70 | Parallax layers `bg-far`, `bg-mid`, `bg-fence`, `bg-ground` | `BACKGROUND.layers` |
| `0 … yBand` (+ `seed × 1e-4`) | The follower depth band, keyed on feet line | `Follower` ctor, `HORDE_SPREAD.offsets` |
| `yBand + 1` | Emily and every soldier | `CHARACTER_FRONT_DEPTH` |
| 10 | Thrown limbs and bullets | `PROJECTILE_DEPTH` |
| 50 | The thrown limb's overhead marker | `LIMB.marker.depth` |
| 850 | The Rifleman's aim lane | `GunfireSystem` |
| 900 | The feed bar | `GameScene` |
| 999 | `?debug=1` labels and the TRAIL SATURATED warning | `GameScene` |
| 1000 | HUD (graphics + text), screen-pinned | `Hud` |
| 1001 | The CLEARED end-state text | `GameScene.showCleared` |

Two things fall out of the table that are easy to break later:

- **`HORDE_SPREAD.yBand` has a hard ceiling of 8.** `CHARACTER_FRONT_DEPTH` is
  derived as `yBand + 1`, and `PROJECTILE_DEPTH` is a flat 10, so a `yBand` of
  9 or more would push characters into or past the projectile layer and limbs
  would start being swallowed again. (The gunfire lane imposes a looser
  ceiling of 10 — see below — so the depth constant is the binding one.)
- The seed epsilon (`1e-4`) means the tie-break only stays inside the band
  below ~10,000 spawned followers. Not a practical concern; noted so it isn't
  rediscovered as a mystery.

### Projectiles needed an explicit depth

Confirmed live, not theorised: bullets and limbs sat at the default depth 0 —
*inside* the character band — and could be swallowed by any follower standing
a pixel nearer the camera. `Limb` and `Bullet` now share `PROJECTILE_DEPTH`,
above every character and below the limb's own overhead marker.

### What it costs in contact geometry, with numbers

`CombatSystem` measures **centre-to-centre Euclidean distance**, so a
follower's vertical offset `dy` from a canonical-Y soldier or Emily shrinks its
effective *horizontal* reach to `sqrt(reach² − dy²)`. With the band one-sided
and `yBand` at its current value (6), and soldiers/Emily at `WORLD.groundY`:

- **BASE** (`FOLLOWER.reach` 16, `spawnYOffset` 0): worst case `dy = 6` →
  `sqrt(256 − 36) = 14.83`, a **~1.17px (7.3%)** horizontal loss.
- **BRUTE** (`BRUTE.reach` 20, `spawnYOffset` −4): its own offset pulls it
  back toward a soldier's line, so its `dy` spans −4…+2 and the worst case is
  4 → `sqrt(400 − 16) = 19.60`, a **~0.40px (2.0%)** loss.

Note this inverts the figures in the original issue body (0.51px base /
1.67px brute), which were computed for the **symmetric ±4** band that was
abandoned in Amendment 2. Under the final one-sided band the Brute is the
*less* affected of the two, not the more. **Accepted with no compensation** —
it is sub-pixel-to-1.2px, and per CLAUDE.md "this breaks balance" would not be
grounds to reject even if it were larger; the paired-addition answer (bump
`reach` on the other side) exists if it ever matters.

**Y-sensitive systems audited and found safe:**

- **`GunfireSystem`** — `HIT_Y_TOLERANCE` is 16 and a bullet spawns at
  `soldier.y − 6`. A base follower at the very front of the band is 12 off the
  lane centre, a Brute 8 — both inside tolerance, so **the band cannot push a
  follower out of the gunfire lane** and the "horde eats bullets" /
  consumable-screen behaviour is preserved intact. That margin is also a
  second ceiling on `yBand` (it would break above 10).
- **`findNearestEngageable`** (`engageRadius` 140/200) and
  **`AggroSystem.tryActivate`** (`rushAcquireRadius`) — centre-to-centre
  against radii ≥140; a few px of Y is under 0.2px of effective radius.
  Negligible.
- **`GameScene.nearestZombieX`** (soldier facing, call-for-help) — same
  scale, same conclusion.
- **`GameScene.handleLimbHits`** — `physics.overlap(limb, soldier)`; follower
  Y is not involved at all. Unaffected.

Note also that the band never touches a hitbox: `applyCharacterArt` still sets
every body explicitly from `CHARACTER_ART.hitbox`, bottom-centred on the
figure's own line. The `artRoster` test remains the guard on that, now
comparing against each follower's personal `GROUND_LINE + depthOffset` rather
than the global line (soldiers keep offset 0, so their assertions are
unchanged).

### What was deliberately not changed

The **>20-follower trail pile-up** — `TRAIL.bufferSize` ÷
`TRAIL.spacingSamples`, surfaced as `TRAIL_DEGENERATION_THRESHOLD` and a
`?debug=1` TRAIL SATURATED warning. Per CLAUDE.md and `docs/PROGRESSION.md` §1
that is a **documented diagnostic threshold, not a mechanic and not a cap to
enforce**. This work does not touch `BreadcrumbTrail.targetXForOffset`'s clamp
and **adds no headcount cap of any kind.**

Incidental benefit worth knowing: the depth band makes even a pile-up
*countable*. A co-located clump now renders as a short depth-staggered stack
of distinct heads instead of one silhouette, and the horizontal spread softens
(does not fix) the co-location. If the pile-up itself ever deserves a real fix
— a wider buffer, or de-degenerating the clamp — that is a separate issue.

### What the tests guard

`hordeSpread` (demo + test, `src/debug/`) spawns eight followers — a Brute plus
seven base — bunched into the space a stopped horde collapses into, and
asserts: no two followers share a depth; every offset is forward of the ground
line and within `HORDE_SPREAD.yBand`; every follower's feet land on the street
texture as actually drawn; more than one distinct offset is in use (so the seed
is really varying); draw order is monotonic in the feet line; and each
follower's feet sit on its *own* ground line rather than the global one.

Two lessons from building it are recorded in `docs/TESTING.md`'s gotchas and
not repeated here: **a green suite does not mean a visual fix works**, and
**depth sorting must key on the feet line, not sprite `y`** (a Brute's
`spawnYOffset` means two figures on the same line have different `y`).

### Cross-links

- [#31](https://github.com/darkwebdev/zombie-emily/issues/31) — the issue this
  decision closes; its thread carries the live-verification reports.
- [#32](https://github.com/darkwebdev/zombie-emily/issues/32) — follower
  surround; source of Amendment 3. Its own decision is not recorded here.
- `docs/PROGRESSION.md` §1 — the uncapped-horde decision and the ~34px rank
  spacing this interacts with.
- `docs/TESTING.md` — the gotchas this work produced.
