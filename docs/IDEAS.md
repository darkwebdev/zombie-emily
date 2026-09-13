# Future Ideas

Not scoped or designed yet — just captured so they don't get lost. Pull one
into an actual design pass (planner agent) when ready to build it.

Ideas that have been through a design pass move out of this file into GitHub
issues, and out of those issues into a doc once the decision is final — see
"Where design work lives" in CLAUDE.md.

(Follower fusion, formerly listed here, has been built — 4 base followers
auto-merge into a Brute; see `FUSION`/`BRUTE` in `src/config/tuning.ts` and
`GameScene.checkFusion()`.)

## Absorb incoming hits, then release them all at once

A *feel* note, not a mechanic yet — parked verbatim: "i like the feeling of
collecting power that later unleashes like shaman works in diablo 3 or Beidou
in genshin impact that absorbs enemy hits and reflects all of them back at
once". The essence is accumulation → release: power banks up over time (the
Diablo 3 shaman) or is specifically *soaked from incoming attacks* and given
back in one payload (Beidou's shield). Nothing here says who absorbs (Emily?
a follower? the horde?), what the release does, or what the meter is
denominated in. Those are the design questions, not decided here.

- **The aggro meter is already this shape, and that's the first thing a design
  pass has to settle.** `AGGRO` in `src/config/tuning.ts` is `max: 1.0`,
  `fillTime: 12.0`, `rushDuration: 4.0`, and `AggroSystem.tryActivate()` spends
  the whole bar in one press — a charge-up-then-unleash system that already
  ships, already has a HUD bar (`Hud`, the second bar under HP), and already
  owns the only burst input (`Space`). Two readings follow and they are very
  different ideas: *re-source the existing meter* (fill on damage absorbed
  instead of `dt / fillTime`, which is currently a pure timer gated only on
  `followerCount > 0` — nothing the player does affects it) versus *add a
  second parallel meter*, which would be straightforwardly redundant with it.
  The first is an extension of something shipped; the second needs to argue why
  one charge bar isn't enough.
- **It also sidesteps the open third-input-key problem, which is a point in its
  favour.** `BULWARK_2`'s charge trigger
  ([#9](https://github.com/darkwebdev/zombie-emily/issues/9)), the bunny decoy
  ([#21](https://github.com/darkwebdev/zombie-emily/issues/21)) and the
  rejected bunny skill ([#19](https://github.com/darkwebdev/zombie-emily/issues/19))
  all stall on the same unresolved question — this game has two keys (`J`,
  `Space`) and no accepted design has paid for a third. A release that fires on
  the existing `Space` needs no new key at all.
- **"Reflects them back" is Emily dealing direct damage, which has been rejected
  three times on premise grounds.**
  [#14](https://github.com/darkwebdev/zombie-emily/issues/14) items 1, 16 and 22
  (plus [#18](https://github.com/darkwebdev/zombie-emily/issues/18) and
  [#19](https://github.com/darkwebdev/zombie-emily/issues/19)) — Emily's one
  verb does zero damage deliberately, and item 22 explicitly says don't reopen
  it without its own issue about the premise. There's also a concrete economic
  break: `beginConversion` is reachable only from `PARALYZED`, so an
  Emily-sourced kill produces a corpse with no follower. The register's standing
  conversion for this (item 18, and the precedents at
  [#9](https://github.com/darkwebdev/zombie-emily/issues/9) /
  [#11](https://github.com/darkwebdev/zombie-emily/issues/11)) is that **any
  area effect in this game applies `PARALYZED`** — so the obvious reshape is
  "release = mass paralyze scaled by what you absorbed." Worth checking whether
  that still carries the feel Tim described, or whether it's then just
  [#9](https://github.com/darkwebdev/zombie-emily/issues/9)'s lane charge with a
  different meter in front of it.
- **Absorption has exactly two hook points, and `iframeDuration` sits in front
  of both.** Damage reaches Emily only via `Emily.takeDamage` — from
  `CombatSystem` (contact, guarded by `contactDamage > 0`) and `GunfireSystem`
  (the nearest-body bullet sweep). `EMILY.iframeDuration 0.6` already swallows
  hits silently, so "hits absorbed" and "hits attempted" are not the same
  number, and `CombatSystem`'s own comment records how brittle that path is (a
  `takeDamage(0)` call from a Rifleman grants a free i-frame window that eats
  every other soldier's hit). Any "count what hit me" meter has to decide what
  it counts first.
- **Absorbing contact damage is, specifically, the thing the register protects
  as the game's only real risk decision.** The contested feed —
  `GameScene`'s feed check uses `COMBAT.contactRange` 16px (not a wider feed
  radius) and `Emily.handleMovement` zeroes velocity for the full
  `EMILY.feedTime` 2.0 — costs ~2 HP next to a STANDARD and ~4 next to a SHIELD,
  and [#14](https://github.com/darkwebdev/zombie-emily/issues/14) item 23
  rejected removing `maxHp` largely because that quantity *is* the decision
  ("is this conversion worth a fifth of my health?"). A shield that converts
  that cost into stored power is the same deletion arriving as a reward. Scoping
  it to bullets only, or to a window the player has to arm, are the obvious
  ways out.
- **It touches both open HP designs.**
  [#16](https://github.com/darkwebdev/zombie-emily/issues/16) (`EMILY_REGEN`) is
  denominated entirely in HP and gates on `Emily.timeSinceDamage` via
  `suppressAfterDamage 4.0` — an absorbed hit would have to decide whether it
  counts as damage for suppression purposes.
  [#24](https://github.com/darkwebdev/zombie-emily/issues/24) (`EMILY_DOWN`)
  triggers on `hp <= 0` on the graded bar, so anything that soaks damage shifts
  when a knockdown can happen at all. Conversely,
  [#10](https://github.com/darkwebdev/zombie-emily/issues/10)'s per-target
  `healSuppressAfterDamage` gate is the shipped template for "a mechanic timed
  off recent damage" and is probably the pattern to copy rather than invent.
- **A follower-facing version may be the cheaper home than an Emily skill.**
  [#14](https://github.com/darkwebdev/zombie-emily/issues/14) item 22 rejected
  "a special follower grants Emily a new verb" as a *pattern*, and every shipped
  special acts on its own via inert-default stats fields. `BULWARK`
  ([#6](https://github.com/darkwebdev/zombie-emily/issues/6): `hp 10`,
  `damageTakenMult 0.5`, `hitHalfWidth 16`) is already the designated bullet
  soak, which makes "absorbs hits, gives them back" a natural fit for it — but
  [#9](https://github.com/darkwebdev/zombie-emily/issues/9) already owns
  `BULWARK_2`, so that slot is taken and tier-2 is a same-kind merge
  ([#8](https://github.com/darkwebdev/zombie-emily/issues/8)), not an ability
  bolted on.
- **"Spend a lot for a big swing" already has an owner.**
  [#2](https://github.com/darkwebdev/zombie-emily/issues/2)'s limb ladder prices
  exactly that through the leg steps (`speed 140 → 90 → 60`) and the retrieval
  walk, and item 22 cites it when rejecting a different burst. Not an objection —
  just a second progression channel for Emily that a design pass has to
  justify against the one
  [#2](https://github.com/darkwebdev/zombie-emily/issues/2) settled.

## Long-range enemies that out-range Emily's throw (mortars, snipers)

An enemy class that attacks from beyond Emily's own reach — "mortar guys or
snipers," per the user's comment on
[#23](https://github.com/darkwebdev/zombie-emily/issues/23), named there as the
thing a farthest-target follower ability would exist to counter. No enemy like
this exists yet, and that's what makes it interesting: it would be the first
one designed to sit *outside* the game's two current range invariants.

- **It deliberately breaks the two bounds `RIFLEMAN` was tuned to respect.**
  `RIFLEMAN.fireRange` is 130, kept under both the camera's 160px viewport
  half-width (so it never shoots from off-screen) and the limb's ~138px throw
  reach (so Emily can always answer anything that can hit her) — see the
  comment on `RIFLEMAN` in `src/config/tuning.ts`. A mortar or sniper is by
  definition outside the second bound, and probably the first too. Whether
  "never shoots from off-screen" survives is the central question, since an
  attacker you cannot see *or* reach is a different kind of game from this one.
- **It inverts the game's movement premise.** Every current enemy either fights
  on contact or stands and shoots from inside throw range, so Emily always has
  the option to answer in place. An enemy that out-ranges her forces her to
  *close the distance* — which is the opposite of the dynamic where all movement
  pressure comes from her own choices rather than from being compelled.
- **It's the paired half of [#23](https://github.com/darkwebdev/zombie-emily/issues/23)
  and shouldn't be designed apart from it.** Per CLAUDE.md's balance-pairing
  rule, the ability and the enemy justifying it are one design: a farthest-target
  skill with no long-range enemy is a solution without a problem, and a sniper
  with no way to reach it is a wall. The user's framing puts that ability on the
  Spitter, likely `SPITTER_2`
  ([#11](https://github.com/darkwebdev/zombie-emily/issues/11),
  [#8](https://github.com/darkwebdev/zombie-emily/issues/8)).
- **The real open question is the pre-Spitter counterplay.** If this enemy
  out-ranges the limb throw, what answers it *before* the horde has a Spitter?
  That's the same gating structure the Commander now uses — the dangerous enemy
  ships before its clean answer, and beating it the hard way is what unlocks
  that answer ([#12](https://github.com/darkwebdev/zombie-emily/issues/12)) — so
  that precedent is worth reusing rather than re-deriving. Candidate partial
  answers that already exist: the Bulwark as mobile cover
  ([#6](https://github.com/darkwebdev/zombie-emily/issues/6)) and the rush burst.

## Moved into design discussion

Both former entries here — "Loot from converted enemies" and "Special zombie
types via items" — have been through a design pass and now live as GitHub
issues under the character-progression epic,
[#15](https://github.com/darkwebdev/zombie-emily/issues/15). The loot economy
and the item queue are
[#5](https://github.com/darkwebdev/zombie-emily/issues/5); the special
follower types are
[#6](https://github.com/darkwebdev/zombie-emily/issues/6),
[#7](https://github.com/darkwebdev/zombie-emily/issues/7),
[#10](https://github.com/darkwebdev/zombie-emily/issues/10) and
[#11](https://github.com/darkwebdev/zombie-emily/issues/11).

**Resurrect followers** — rejected on the merits (no price point is both
novel and non-sting-undercutting; duplicates the corpse drop for tier-1
specials). See [#14](https://github.com/darkwebdev/zombie-emily/issues/14)
item 15. Surfaced one real gap, routed as a `CORPSE_DROP` tier-aware amendment
to [#8](https://github.com/darkwebdev/zombie-emily/issues/8) (comment,
pending formal incorporation).

**Boss enemy at the end of each level** + **Boss drop: plush bunny**
(designed together, per the note that tied them) — epic:
[#22](https://github.com/darkwebdev/zombie-emily/issues/22), covering:
- [#17](https://github.com/darkwebdev/zombie-emily/issues/17) — what a boss is
  mechanically (a stats-pattern `EnemyKind`, difficulty via a stagger gate,
  not HP or a new class).
- [#18](https://github.com/darkwebdev/zombie-emily/issues/18) — the reward is
  a follower-facing tier-2 promotion (`ITEM_PROMOTE`), not an Emily skill.
- [#19](https://github.com/darkwebdev/zombie-emily/issues/19) — the bunny's
  attract/weaken/auto-return throwable-skill half is rejected in full.
- [#20](https://github.com/darkwebdev/zombie-emily/issues/20) — this work is
  not blocked by the open roguelike/campaign question
  ([#13](https://github.com/darkwebdev/zombie-emily/issues/13)).
- [#21](https://github.com/darkwebdev/zombie-emily/issues/21) — a bunny decoy
  ("move attention, not bodies") survives every objection but is deprioritized
  pending a shared input-key decision with #9.

Rejected sub-ideas from this pass are recorded in
[#14](https://github.com/darkwebdev/zombie-emily/issues/14) items 16-20.

**Fast metabolism mode** — already fully resolved; this is exactly
`HEALER_2`'s arms-only fast-metabolism burst, designed as part of
[#10](https://github.com/darkwebdev/zombie-emily/issues/10)/the register
([#14](https://github.com/darkwebdev/zombie-emily/issues/14) item 6's
revision). No new design pass needed.

**Puller: drag the farthest enemy into the horde** — rejected on the merits
(same objection as the enemy-pull grapple: it moves an authored enemy
position, regardless of whether the move is a drag or a teleport; "farthest
enemy" reliably targets the Rifleman by construction rather than narrowing
the harm; no delivery vehicle exists at either the base-special or tier-2
level). See [#14](https://github.com/darkwebdev/zombie-emily/issues/14) item
21. The one part that survives — a follower that rushes to the *farthest*
soldier instead of the nearest, which moves an unauthored follower position
instead — is spun out as its own undesigned issue,
[#23](https://github.com/darkwebdev/zombie-emily/issues/23).

**Airborne limb barrage** — rejected in full. Floating contradicts the flat-
ground invariant harder than the crawl/roll/jump idea already rejected for
the same reason; Emily dealing direct damage reverses her core premise (a
third time, after [#18](https://github.com/darkwebdev/zombie-emily/issues/18)
and [#19](https://github.com/darkwebdev/zombie-emily/issues/19)); the burst
itself buys 1.2 seconds of overlap the game doesn't need and can't be made
worth a third input key without becoming one of the other rejected parts; a
follower-granted Emily verb is rejected as a pattern the project shouldn't
add. See [#14](https://github.com/darkwebdev/zombie-emily/issues/14) item 22.

**No HP: instant loss on contact, followers revive her** — the binary-
incapacitation reading is rejected on the merits (it deletes the game's only
real risk decision — the contested feed — and has no coherent down-state);
the broad reading (removing HP from Followers/Soldiers too) is rejected
outright (soldier HP is the conversion clock the whole paralyze/eat/fusion
pacing is derived from). See
[#14](https://github.com/darkwebdev/zombie-emily/issues/14) items 23-24. What
survives — a knockdown at 0 HP on the existing graded bar, revived by a
nearby follower at a real cost — is designed in full as
[#24](https://github.com/darkwebdev/zombie-emily/issues/24) (`EMILY_DOWN`),
which requires a small amendment to
[#16](https://github.com/darkwebdev/zombie-emily/issues/16) (`EMILY_REGEN`,
comment pending formal incorporation).

Ideas that were considered and *rejected* during any of these passes are
recorded with their reasons in
[#14](https://github.com/darkwebdev/zombie-emily/issues/14), so they don't get
re-proposed from scratch.
