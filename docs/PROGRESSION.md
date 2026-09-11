# Character Progression — finalized decisions

Running record of decisions from the character-progression epic,
[#15](https://github.com/darkwebdev/zombie-emily/issues/15), as each one is
approved. One section per decision, added as it lands; the epic's issues hold
the debate, this file holds the outcome.

> **These are decisions, not a changelog.** A section here means the call has
> been made and the issue is closed — **not** that the code has been changed.
> Each section says explicitly what state its implementation is in.
> `src/config/tuning.ts` and the code remain the source of truth for what the
> game currently does.

---

## 1. Remove `HORDE_CAP` and `slotCost`

**Decided** — approved on [#3](https://github.com/darkwebdev/zombie-emily/issues/3).
**Implementation: not done.** Phase 2 of the epic, alongside the enabling
refactors ([#4](https://github.com/darkwebdev/zombie-emily/issues/4)). As of
this writing `HORDE_CAP = 8` and `slotCost` are still live in
`src/config/tuning.ts`, and `GameScene.finishConversion` still gates on them.

### The decision

Delete the horde cap and the slot currency that exists to serve it. The horde
becomes uncapped. Nothing replaces them — no substitute budget, no headcount
limit.

### Why

**It never binds.** Trace level 1 to a full clear with automatic fusion
running: 4 conversions → 1 Brute (2 slots); 8 → 2 Brutes (4 slots); all 10 →
2 Brutes + 2 base followers = **6 of 8 slots.** The cap cannot fire in the
only level that exists. Meanwhile it costs real complexity at every point of
contact: every piece of reasoning about the horde has to carry the caveat
"sum `slotCost`, never use `followers.length`."

**Automatic fusion is already the compressor.** Four units become one, at
every tier (`FUSION.requiredBase = 4`). After N conversions you hold ~N/4
specials plus at most 3 stragglers; with tier-2 merging
([#8](https://github.com/darkwebdev/zombie-emily/issues/8)) it is ~N/8. The
horde grows **sub-linearly in the only currency that exists.** Nothing runs
away, so there is nothing for a cap to catch.

**The real ceiling is structural, and lives in the trail.**
`TRAIL.bufferSize` is 120 samples at `sampleIntervalMs` 60 = 7.2s of history,
and `BreadcrumbTrail.targetXForOffset` clamps its index with
`Math.max(0, len - 1 - offset)`. Base followers accumulate `trailSpacing` 6
samples each, so **follower ~20 exceeds the buffer, and every follower past it
targets the same oldest sample and piles up at one x.** That is the genuine
limit (higher for tighter-spacing kinds — a Brute uses 4). It belongs in the
codebase as a **documented threshold and a diagnostic, not a mechanic.**

**Legibility fails earlier than that, and harmlessly.** At `EMILY.speed` 140
each rank sits ~50px behind the last (6 samples × 60ms × 140), and the
viewport is `WORLD.width` 320 with Emily centered — so **only about three
followers are on screen at all while she is moving.** The conga line is
already mostly off-camera. An unbounded horde is not a visual problem; it is
an invisible one. (When she stops they bunch at her position and all become
visible — existing behavior, unchanged.)

**Performance is a non-issue.** Arcade physics at 30–100 sprites with no
pooling is nothing. FIRST_BUILD's "~30 entities, doesn't need pooling" holds
with a lot of headroom.

**`slotCost` has no life of its own.** It existed *solely* to serve
`HORDE_CAP` — a currency invented for a ceiling that never fired. "A Brute
costs 2" survives as the thing it always actually was: **fusion compresses 4
units into 1.** `slotCost` added no information on top of that.

`trailSpacing` is **not** a substitute budget. It encodes formation position
(Bulwark 3 = front, Healer 8 = back), so using it as a cost would make the
front-line wall the cheapest unit — backwards.

### What it implies for implementation (Phase 2, not yet done)

- Delete `HORDE_CAP` from `src/config/tuning.ts` and `slotCost` from
  `FOLLOWER`, `BRUTE`, and every future `FOLLOWER_STATS` entry.
- Delete the cap-check branch in `GameScene.finishConversion` — the path that
  consumes a body without spawning a follower — so a conversion always spawns.
- Delete `GameScene.usedSlots()`.
- Add the trail-degeneration threshold as a comment near `TRAIL` in
  `tuning.ts`, plus a `?debug=1` warning when the follower count approaches
  `TRAIL.bufferSize / TRAIL.spacingSamples` (~20).
- Update CLAUDE.md, which currently lists the slot-budget rule under "Things
  every change should respect."

**Test fallout:**

- The `hordeCap` demo (`src/debug/demos.ts`) and its test
  (`src/debug/tests.ts`) are deleted, along with the `HORDE_CAP` /
  `slotCost` assertions in the fusion test.
- The EATEN-counter check that hung off that demo — "counter still increments
  when the cap blocks the spawn" — **must be dropped**; the branch it tests
  will no longer exist. See
  [#1](https://github.com/darkwebdev/zombie-emily/issues/1).
- Otherwise the existing suite must hold its current pass count exactly.

### The one cost, and its mitigation

If long multi-level runs land later (see
[#13](https://github.com/darkwebdev/zombie-emily/issues/13), roguelike vs.
authored campaign), an uncapped horde over 100+ conversions could matter
again. Keeping the trail-derived threshold documented means re-capping later
is **"add one check against a number we already derived,"** not "re-invent a
currency."
