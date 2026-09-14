# Future Ideas

Not scoped or designed yet — just captured so they don't get lost. Pull one
into an actual design pass (planner agent) when ready to build it.

Ideas that have been through a design pass move out of this file into GitHub
issues, and out of those issues into a doc once the decision is final — see
"Where design work lives" in CLAUDE.md.

(Follower fusion, formerly listed here, has been built — 4 base followers
auto-merge into a Brute; see `FUSION`/`BRUTE` in `src/config/tuning.ts` and
`GameScene.checkFusion()`.)

Currently empty — every idea logged here has been through a design pass; see
"Moved into design discussion" below for where each one landed. Drop a new
one in via `/save-idea` when it comes up.

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

**Absorb incoming hits, then release them all at once** — the two literal
readings (Emily reflecting absorbed damage back, or a second parallel meter
alongside the aggro bar) are both rejected on the merits; an armed
Emily-facing parry window and a per-follower Bulwark absorb ability are both
deprioritized (no third input key yet; already superseded by the accepted
design). See [#14](https://github.com/darkwebdev/zombie-emily/issues/14)
items 25–28. What's accepted instead is
[#27](https://github.com/darkwebdev/zombie-emily/issues/27)
(`AGGRO_ABSORB`) — the existing aggro/rush meter re-sourced to fill from
damage the horde (not Emily) absorbs, with a decaying overcharge that
lengthens the rush burst. No new key, no new meter, no new area effect.

**Long-range enemies that out-range Emily's throw (mortars, snipers)** —
designed as a paired mechanic per CLAUDE.md's balance-pairing rule, alongside
[#23](https://github.com/darkwebdev/zombie-emily/issues/23) (the
farthest-target follower ability spun out of the Puller rejection).
[#28](https://github.com/darkwebdev/zombie-emily/issues/28) (`MORTARMAN`)
is the new enemy — the first designed to sit outside both of `RIFLEMAN`'s
range invariants, using the now-retired-and-replaced movement rule (see
CLAUDE.md's "Emily drives the game's movement" section) to retreat and keep
its distance. #23 is now a complete design landing the farthest-target leap
on `SPITTER_2`, combined with (not instead of) its splash upgrade — see the
resolution comment on [#11](https://github.com/darkwebdev/zombie-emily/issues/11).

Ideas that were considered and *rejected* during any of these passes are
recorded with their reasons in
[#14](https://github.com/darkwebdev/zombie-emily/issues/14), so they don't get
re-proposed from scratch.
