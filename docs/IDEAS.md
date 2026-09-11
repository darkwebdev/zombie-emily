# Future Ideas

Not scoped or designed yet — just captured so they don't get lost. Pull one
into an actual design pass (planner agent) when ready to build it.

Ideas that have been through a design pass move out of this file into GitHub
issues, and out of those issues into a doc once the decision is final — see
"Where design work lives" in CLAUDE.md.

(Follower fusion, formerly listed here, has been built — 4 base followers
auto-merge into a Brute; see `FUSION`/`BRUTE` in `src/config/tuning.ts` and
`GameScene.checkFusion()`.)

## Resurrect followers

A dead follower comes back — either via a new skill of Emily's, or as a
capability on a healing-type follower. Needs design: what "resurrect" means
mechanically (a fresh base follower at the death spot? the same follower
restored with its kind/tier intact?), what triggers it (automatic, like
today's healing regen, or a spendable action), and a cost, since bringing a
follower back for free undercuts the loss that currently makes losing a
follower — especially a special — actually sting.

Note the related discussion already in flight: "the Healer heals followers
too" was proposed and rejected at tier 1 in the character-progression pass
(see the rejected-ideas register,
[#14](https://github.com/darkwebdev/zombie-emily/issues/14), item 13) because
it breaks followers-as-consumable-cover, and the corpse-drop mechanic
([#8](https://github.com/darkwebdev/zombie-emily/issues/8)) was adopted
instead as a restorative-rather-than-preventive answer to the same problem.
Resurrection is a third answer to that same problem and should be weighed
against those two, not designed independently of them.

## Boss enemy at the end of each level

A boss at each level's end drops an item that either gives Emily a new skill
or lets a special follower be upgraded with an additional skill. Needs design
on several fronts: this presupposes multiple levels exist, which ties directly
into the open roguelike-vs-campaign question
([#13](https://github.com/darkwebdev/zombie-emily/issues/13)) — a boss reward
that must persist to matter is exactly the kind of cross-run state that
question is still deciding. It also raises "does Emily need skills at all,"
which the progression pass already took a position on: her stat numbers are
load-bearing constraints, not a level-up track, and her one accepted
progression axis is the limb ladder
([#2](https://github.com/darkwebdev/zombie-emily/issues/2)), which is a cost
model, not a skill grant — so an Emily "skill" from a boss drop needs to be
reconciled with that verdict, not layered on top of it without comment. The
follower-upgrade half fits more naturally: it reads as a third way into the
tier-2 upgrade slot already designed in
[#8](https://github.com/darkwebdev/zombie-emily/issues/8) (today tier-2 is
reached only by merging two specials) and should be evaluated against that
mechanic rather than built as a separate one. Also needs: what a boss actually
is mechanically (existing `EnemyKind` stats-pattern, or something structurally
different), and whether it collides with "enemies never reposition on their
own" the way Commander enemies do
([#12](https://github.com/darkwebdev/zombie-emily/issues/12)).

## Fast metabolism mode

A skill that regenerates thrown limbs and restores HP — likely as an advanced
Healer ability with a long cooldown, rather than an Emily skill. Needs design:
exact trigger and cooldown, and how "regenerates new limbs when old ones are
thrown" interacts with the limb ladder
([#2](https://github.com/darkwebdev/zombie-emily/issues/2)) — that ladder's
whole mechanic is that a thrown limb must be physically retrieved, with speed
degrading until it is, so a skill that regrows a limb instead of requiring
retrieval removes exactly the cost the ladder installs. That's the same shape
of conflict already worked through for auto-return
([#14](https://github.com/darkwebdev/zombie-emily/issues/14), item 3) and
needs to be reconciled with it, not designed as if the ladder didn't exist.
The HP-restore half is more straightforward and reads as a stronger version of
the existing Healer aura already designed in
[#10](https://github.com/darkwebdev/zombie-emily/issues/10), including its
suppression-gate reasoning — a long cooldown suggests this is meant as a burst
rather than a replacement for that aura, which should be stated explicitly
rather than left implicit. If it does land on the Healer as an advanced skill,
it's a candidate for the `HEALER_2` slot that tier-2 merging
([#8](https://github.com/darkwebdev/zombie-emily/issues/8)) already reserves.

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

Ideas that were considered and *rejected* during that pass are recorded with
their reasons in [#14](https://github.com/darkwebdev/zombie-emily/issues/14),
so they don't get re-proposed from scratch.
