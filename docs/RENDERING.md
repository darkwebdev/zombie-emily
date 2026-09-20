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

> **Partly revised by §2 (2026-09-20).** The one-sided band is untouched and
> still the rule. What §2 changes is the *blanket* form of "a soldier always
> draws in front of every follower": a follower that has latched a flank side
> and arrived in bite range now draws in front of the soldier it is biting,
> bounded to `FLANK.frontSlotsPerSide` per side, with everyone else on that
> side left behind it. The original text below is kept as written — the
> reasoning it records (why soldiers can't be sorted by feet line, and why
> their tints have to stay readable) is still the reasoning §2 is built to
> respect, and knowing it was once a blanket rule is the point of keeping it.
> Emily's depth constant also moves; her guarantee does not. See §2.

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

> **Superseded by §2's table (2026-09-20)** — two rows are inserted between
> `yBand + 1` and `PROJECTILE_DEPTH` (the flank front lane, and Emily's own
> depth), and the `yBand` ceiling below drops from 8 to 6 as a result. The
> table as it stood for #31 is left here unedited; §2 carries the current one.

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
- §2 below — revises this section's Amendment 2 and replaces its depth table.

---

## 2. A follower that has flanked draws in front of the soldier it is biting — one front slot per side

**Decided** — approved in session on 2026-09-20. No issue was opened for it;
the debate is summarised here, and it revises §1's Amendment 2 (see the marker
there). **Implementation: not started** — `tuning.ts` and the code remain the
source of truth for what the game currently does.

This is explicitly a **"revise the rule"** case under CLAUDE.md's "invariants
are decisions, not permanent laws". Amendment 2 is not rejected and is not
deleted: what it was protecting — *a soldier's state tint has to stay readable
at a glance* — is the constraint this section is shaped around.

### The problem

Reported as: *"surrounding followers are hidden behind enemies, they should
first take place in front, only last ones can be hidden."*

Verified live in the "Surround: Mixed roster" demo (`flankMixed`) at 1.5s:

| Figure | x | y | depth |
| --- | --- | --- | --- |
| SHIELD soldier | 130 | 150 | 7 (`CHARACTER_FRONT_DEPTH`) |
| BASE follower | 137 | 150 | 0 |
| BRUTE follower | 115 | 150 | 4 |

On screen the base follower — which had successfully taken the soldier's right
flank and was parked in bite range — was almost entirely behind the green
Shield Trooper, only a sliver of pink showing; the Brute on the left was partly
behind it too. `CHARACTER_FRONT_DEPTH` is `HORDE_SPREAD.yBand + 1` = 7 and a
follower's band depth is 0…6, so **every soldier draws in front of every
follower, unconditionally** — including at the exact moment a flank has landed
and the flank is the thing the player is meant to read.

The surround mechanic (§1 Amendment 3, [#32](https://github.com/darkwebdev/zombie-emily/issues/32))
costs a follower roughly 500ms of travel to form. Hiding the result behind the
target makes that half second unreadable, which is the same class of bug as the
±4px horde spread: implemented correctly, invisible in play.

### The decision

**A follower draws in front of the soldier it is attacking only when it has
actually flanked and arrived** — and only a bounded number of them per side do.
Everyone else keeps their band depth and stays behind the soldier, which is the
user's "only last ones can be hidden", made literal.

Five conditions, all required, all evaluated fresh every frame:

1. The follower is **engaging a soldier** this frame (it is in `GameScene`'s
   `engaging` map — autonomous engage or an aggro rush).
2. It has **latched a side**: `flankSide !== 0`. A lone engager below
   `FLANK.minEngagers` walks at the soldier's *exact x* (§1 Amendment 3), so
   drawing it in front would occlude the soldier **completely** rather than
   partly. That is precisely the case Amendment 2 exists to prevent, so a lone
   engager is excluded by rule, not by accident.
3. It has **arrived**: centre-to-centre distance to its target is within its
   own bite range, `max(COMBAT.contactRange, stats.reach)`. A follower still
   crossing is not yet "in front"; it passes behind the soldier as it did
   before and steps forward into the slot on arrival. This keeps the lie as
   short-lived as possible and matches the request's wording — *take place* in
   front, i.e. having taken the position.
4. A **front slot is free on its side**. At most `FLANK.frontSlotsPerSide`
   followers per `(target, side)` pair hold one.
5. Once held, the slot is **sticky until the latch is released** (see
   "Claiming and releasing" below) — it is not re-contested while the follower
   drifts within its deadzone, because a depth that flips back and forth is a
   worse artefact than the one being fixed.

**This is a depth-only change. No follower's `y` moves, ever.** Follower.ts's
`depthOffset` stays `readonly` and its doc comment ("so a follower never pops
vertically when one ahead of it dies or fuses") stays true and unqualified.
Re-seating a flanker's `y` to sort it forward honestly was considered and
rejected: it would make every follower pop vertically the moment a fight starts
and again when it ends, at the busiest moment on screen, and it would move the
figure inside the `sqrt(reach² − dy²)` reach budget. Depth-only costs nothing
and pops nothing.

### Why one slot per side, and not a global count

`FLANK.frontSlotsPerSide = 1`. Two figures at ±8–10px standoff around a soldier
leave its central column visible, so its paralyze/aim/shield-flash tint is
still readable — Amendment 2's protection survives intact. Four figures (two
per side) would bury it, which is the bug this section is fixing, pointed the
other way.

Per-side rather than a single global count of 2, because a global count can be
consumed entirely by one side — the exact failure mode the surround work exists
to prevent (a gang-up reading as a queue). Per-side guarantees that **the
surround itself is what becomes visible**: one figure in front on the left, one
in front on the right, and the pile-up behind.

The constant is per-side and tunable, so raising it to 2 (four figures in
front) is a one-number playtest if the fight ever reads as too empty. It is
**not** a cap on anything: side membership, damage, and headcount are all
unchanged — this decides draw order only, and nothing about it limits how many
followers can attack. (Compare `docs/PROGRESSION.md` §1: the horde is uncapped
and this adds no cap of any kind.)

### The depth values

Three derived constants, all in `src/config/tuning.ts`, each one derived from
the one below it so the whole stack tracks `HORDE_SPREAD.yBand` automatically:

```
CHARACTER_FRONT_DEPTH = HORDE_SPREAD.yBand + 1   // = 7  soldiers
FLANK_FRONT_DEPTH     = CHARACTER_FRONT_DEPTH + 1 // = 8  a follower holding a front slot
EMILY_DEPTH           = FLANK_FRONT_DEPTH + 1     // = 9  Emily
```

A follower's depth is one of exactly two values, both carrying the same seed
epsilon the band already uses so **no two followers can share a depth in
either lane**:

```
band  (default)     depthOffset      + seed × 1e-4     // 0 … yBand
front (slot held)   FLANK_FRONT_DEPTH + seed × 1e-4    // 8.0000 … 8.9999
```

`CHARACTER_FRONT_DEPTH` keeps its name even though Emily no longer uses it: it
is still "the depth a character standing on the canonical ground line draws
at", which is every soldier, and renaming it would churn four call sites plus
this document and CLAUDE.md for no new information. Its doc comment in
`tuning.ts` is updated to say so and to point here.

### Emily is split out, and keeps exactly what Amendment 2 gave her

Emily moves from `CHARACTER_FRONT_DEPTH` (7) to `EMILY_DEPTH` (9). **Her
guarantee is unchanged — she still draws in front of every other character.
Only the number moves, because a new lane was inserted underneath her.**

She is deliberately *not* given a front slot and is never flanked: followers
latch sides against soldiers only, and she is the player's avatar, never the
thing being surrounded. Leaving her at 7 was the cheaper option and was
rejected on a concrete case: Emily feeds at contact range (16px) of a soldier
her followers are simultaneously biting, so a front-slot flanker parked 8px off
that soldier's centre would routinely draw over *her* — reintroducing the
reported bug against the one figure the player is steering. The request was
about enemies; letting it silently demote Emily too would be an unintended side
effect of a flat lane, not a decision.

### Claiming and releasing

One pass, `GameScene.updateFlankDepths(engaging)`, run **after** the follower
movement loop and before `updateSoldierTargeting()`. It must run after, because
`flankSide` is latched inside `flankSlotX` during that loop, and a slot must be
resolved against this frame's final sides.

The pass assigns a depth to **every** follower each frame, so there is no
separate "clear it" code path that can leak: a follower that stops qualifying
for any reason (target died, target changed, it re-targeted, it lost its latch,
it walked out of bite range *and* its latch was released, the fight ended, the
demo restarted) is simply not in a holder set that frame and is written back to
its band depth. `Follower.releaseFlankIfNot()` — already called once a frame
before anyone moves — is the single place a latch ends, and it clears the
sticky slot flag along with `flankSide`.

Per `(target, side)` group, the fill order is:

1. **Incumbents first.** Followers already holding a slot for this same target
   and this same side keep it, in the scene's follower-array order, up to
   `FLANK.frontSlotsPerSide`. Incumbency is what makes the assignment stable:
   once granted, a slot cannot be taken away by someone arriving later, so no
   figure ever flips depth mid-fight.
2. **Then arrivals, nearest first.** Any remaining slots go to non-incumbent
   candidates that are within bite range, sorted by ascending centre-to-centre
   distance to the target.
3. **Tie-break: iteration order of `engaging`, i.e. the scene's follower array
   (spawn order) — deliberately not `rank`**, exactly as `flankSlotX`'s own
   tie-break already is, and for the same reason: `rank` renumbers when a
   follower ahead dies or fuses, so a rank-keyed order would reshuffle draw
   order mid-fight.

Because a slot only becomes free when its holder dies, re-targets, or loses its
latch, "nearest arrival takes the free slot" resolves to *first come, first
served* in practice — the user's "first take place in front" — while staying a
pure function of this frame's state plus the sticky flag.

Edge cases, decided:

- **The holder dies.** Its slot is free the next frame and the nearest arrived
  candidate on that side takes it. One depth change, on a figure that just
  stepped into a gap that visibly opened — motivated, not a pop.
- **The target dies.** `releaseFlankIfNot(null)` clears the latch and the slot;
  everyone reverts to band depth and goes back to the trail as before.
- **The follower re-targets.** Same path — a new fight is a new decision, and
  it must re-arrive at the new target to claim a slot there.
- **Fusion.** The fused Brute is a new object with default state and no slot;
  the four consumed followers are gone. Nothing special to do.
- **An aggro rush.** A rusher is in `engaging` like any other attacker and is
  subject to the same five conditions; nothing about the rush path is special
  cased.

### The depth layering, revised

Current table, back to front. Two rows are new; everything else is §1's table
unchanged.

| Depth | What | Where |
| --- | --- | --- |
| −100 / −90 / −80 / −70 | Parallax layers `bg-far`, `bg-mid`, `bg-fence`, `bg-ground` | `BACKGROUND.layers` |
| `0 … yBand` (+ `seed × 1e-4`) | The follower depth band, keyed on feet line | `Follower` ctor, `HORDE_SPREAD.offsets` |
| `yBand + 1` = 7 | Every soldier | `CHARACTER_FRONT_DEPTH` |
| `yBand + 2` = 8 (+ `seed × 1e-4`) | **A follower holding a front slot** | `FLANK_FRONT_DEPTH` |
| `yBand + 3` = 9 | **Emily** | `EMILY_DEPTH` |
| 10 | Thrown limbs and bullets | `PROJECTILE_DEPTH` |
| 50 | The thrown limb's overhead marker | `LIMB.marker.depth` |
| 850 | The Rifleman's aim lane | `GunfireSystem` |
| 900 | The feed bar | `GameScene` |
| 999 | `?debug=1` labels and the TRAIL SATURATED warning | `GameScene` |
| 1000 | HUD (graphics + text), screen-pinned | `Hud` |
| 1001 | The CLEARED end-state text | `GameScene.showCleared` |

Nothing collides. The new lane occupies the previously empty gap between
`CHARACTER_FRONT_DEPTH` (7) and `PROJECTILE_DEPTH` (10), and the seed epsilon
keeps a front-slot follower strictly below 9 for the first ~10,000 spawns of a
run (8.9999 at worst), so it can never reach Emily's depth.

**`HORDE_SPREAD.yBand`'s hard ceiling drops from 8 to 6.** The binding
inequality is now `yBand + 3 < PROJECTILE_DEPTH`, i.e. `yBand ≤ 6`, so **the
band is sitting exactly at its ceiling** and any increase must raise
`PROJECTILE_DEPTH` in the same change. That is cheap and has no side effects —
the next constant above it is `LIMB.marker.depth` at 50, so `PROJECTILE_DEPTH`
can move anywhere up to 49 — but it is no longer optional, and forgetting it
would put characters into the projectile layer and start swallowing limbs
again. The gunfire-lane ceiling (`HIT_Y_TOLERANCE`, which broke above
`yBand` 10) is no longer the looser of the two by an even wider margin; the
depth constant remains the binding one.

### Contact geometry: unaffected, and here is the arithmetic

Nothing in this section changes any figure's `y`, so `dy` — the vertical
separation `CombatSystem` pays for when it measures centre-to-centre — is
identical to §1's. Both budget lines in `tuning.ts` are restated rather than
recomputed:

- **BASE** (`FOLLOWER.reach` 16, `spawnYOffset` 0, worst-case `dy` = 6):
  `8 + 4 + 2 = 14 ≤ sqrt(16² − 6²) = 14.83`. Holds, with 0.83px of slack —
  exactly as before.
- **BRUTE** (`BRUTE.reach` 20, `spawnYOffset` −4, so `dy` spans −4…+2 and the
  worst case is 4 for the §1 figure / 2 for the comment's own): `10 + 4 + 2 =
  16 ≤ sqrt(20² − 4²) = 19.60`. Holds, with 3.60px of slack — exactly as
  before.

No other Y-sensitive system is touched either: `GunfireSystem`'s
`HIT_Y_TOLERANCE` lane, `findNearestEngageable`, `AggroSystem.tryActivate`,
`nearestZombieX` and `handleLimbHits` all read positions, never depth.
`applyCharacterArt` is not involved: a follower's art is still seated on
`GROUND_LINE + depthOffset` and its hitbox still comes from
`CHARACTER_ART.hitbox`, both unchanged.

### What the tests must guard

The claim is visual, and this repo has a documented history of green suites
that missed exactly this kind of bug (`docs/TESTING.md`: *a green suite does
not mean a visual fix works*; the ±4px spread passed 33/33 while drawing as one
blob). So the checks below are all stated as **observable depth comparisons
against the actual target**, never as "the constant has the value it has".

1. **The reported symptom, in the demo it was reported in** — added to the
   existing `flankMixed` ("Surround: Mixed roster") test: sampled per frame via
   `POST_UPDATE` in the test's `run` (the surround window is short; see the
   gotcha about transient claims), assert that **whenever a flanker is within
   its own bite range of the target, its depth is greater than the target
   soldier's depth**, and that this was observed for *both* the BASE and the
   BRUTE, not just one of them.
2. **The lone engager stays behind** — added to the existing `hordeFlank`
   ("Surround: Standard") test, whose right-hand fight is one follower below
   `FLANK.minEngagers`: its `flankSide` is 0 and its depth stays **below** its
   soldier's, even in contact. This is the check that keeps Amendment 2's
   protection honest.
3. **The overflow rule** — needs a new demo, because no existing scenario puts
   two followers in bite range on the *same* side. Add `flankOverflow`
   ("Surround: Overflow") to the "Surrounding a soldier" group: a paralyzed
   SHIELD (the longest-lived target in the game) with **three base followers
   pre-placed already inside bite range** — two on one side, one on the other —
   so every side is latched and every follower has arrived on the first frames,
   before the volley resolves. Pre-placed rather than walked in, deliberately:
   three base followers deal 12 damage to a 9hp paralyzed SHIELD in one volley,
   so a demo that makes them walk would have nothing left to observe by the
   time they arrived. The test asserts, from live state rather than from the
   setup. (As built, the target is also given `DEMO.surroundTargetHp` — a
   demo-only HP override, see `docs/TESTING.md` — so the overflow is on screen
   long enough to watch rather than for the couple of frames real HP allows.)
   - a **precondition check, reported as its own `Check`**: some side really
     does hold ≥ 2 attackers that are in bite range — so if the setup ever
     stops producing overflow the suite goes red instead of passing vacuously;
   - on that side, **exactly `FLANK.frontSlotsPerSide` of them** have depth >
     the soldier's, and every other one has depth < the soldier's;
   - the other side's single attacker also has depth > the soldier's, so the
     cap is per-side and not global;
   - **Emily's depth exceeds every follower's and the soldier's**, which is the
     guard on the lane order being right.
4. **The band invariant still holds** — `hordeSpread`'s "no two followers share
   a depth" check is unchanged and must stay green, since the front lane
   carries the same seed epsilon.

`docs/TESTING.md`'s demo and case counts (34 demos / 41 cases) move with this
work; updating them is the implementer's job.

**The mutations that prove the tests test something** (per `docs/TESTING.md`:
*restoring the old behaviour is the cheapest way to prove a test actually tests
something* — patch these onto the scene/tuning at runtime and confirm exactly
the predicted cases go red):

| Mutation | Must go red | Must stay green |
| --- | --- | --- |
| `updateFlankDepths` made a no-op (the pre-change behaviour) | checks 1 and 3's front-depth claims | check 2, check 4 |
| `FLANK.frontSlotsPerSide` = 2 | check 3's "exactly one of the pair" | checks 1, 2, 4 |
| Lift every in-range engager regardless of side | check 2 | checks 1, 4 |
| `EMILY_DEPTH` = `CHARACTER_FRONT_DEPTH` | check 3's Emily claim | the rest |

> **Measured, and one prediction was wrong.** Simply deleting the
> `flankSide === 0` guard from condition 2 is a **no-op**, not a mutation: the
> slot loop only ever iterates sides `-1` and `+1`, so a side-0 follower is
> already excluded by the grouping and never reaches a slot. The guard is kept
> anyway — it states the rule where the rule applies, and the loop's shape is
> an implementation detail a refactor could change without noticing. The
> mutation that genuinely proves check 2 is the one in the table above:
> lift every in-range engager *regardless of side*, which reddens check 2
> (86 lifted frames) and check 3, and leaves checks 1 and 4 green.

And, because none of the above is a substitute for looking: re-run "Surround:
Mixed roster" in a real browser, screenshot at ~1.5s, and confirm the pink base
follower is visibly in front of the green Shield Trooper. CLAUDE.md's "verify
live in the browser" rule applies with full force here — this is a cosmetic,
positional change, which is the exact category that has fooled this suite
before.

### Alternatives considered and rejected

- **Sort soldiers by feet line like everyone else** (delete the exemption).
  Rejected on Amendment 2's own merits: soldiers stand on the canonical line,
  which is the *back* edge of the band, so this buries every soldier behind
  every follower at all times — strictly worse than the bug being fixed.
- **Re-seat a flanker's `y` forward so the sort becomes honest.** Rejected:
  visible vertical pop at the start and end of every fight, and it moves the
  figure inside the reach budget. See "depth-only" above.
- **Lift every engaging follower in front, unbounded.** Rejected: that is just
  the original bug with the roles swapped — a soldier under a five-follower
  gang-up would be completely hidden, and its tint is the tell the whole loop
  runs on.
- **A single global front-slot count of 2.** Rejected: both slots can be taken
  by one side, so the thing made visible would not be the surround.
- **Grant the lift at latch time rather than on arrival.** Workable and
  simpler — one condition fewer, and no stickiness needed — but it draws a
  crossing follower in front of the soldier for the whole ~500ms walk-through,
  fully occluding it at the moment its state matters most, and it discards §1's
  "the band is what makes a follower crossing *behind* a soldier read
  correctly". Arrival-gating keeps the lie to the parked case the report is
  actually about.

### Cross-links

- §1 Amendment 2 above — the rule this revises; its marker points back here.
- §1 Amendment 3 above — the flank slots (`flankSide`, `flankStandoff`) this
  decision reads and never modifies.
- [#32](https://github.com/darkwebdev/zombie-emily/issues/32) — follower
  surround, the mechanic whose result was being hidden.
- [#35](https://github.com/darkwebdev/zombie-emily/issues/35) — most fights end
  before a gang-up forms. Related but separate: that one is about the surround
  having time to *happen*, this one is about it being *visible* once it has.
- `docs/TESTING.md` — the transient-claim, vacuous-check and
  green-suite-isn't-a-visual-fix gotchas the test plan above is built on.
