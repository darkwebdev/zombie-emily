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

## Airborne limb barrage

Emily floats up and throws all her limbs at once in a forceful burst that
damages enemies — as an Emily skill if she gets skills, or as a behaviour a
special follower grants her. This touches more existing decisions than any
idea logged so far, and needs all of them reconciled before it's designable:

- **Floating contradicts a stated invariant, more directly than anything
  proposed before.** `physics.world.gravity.y = 0`, Emily's body is
  `setAllowGravity(false)`, and docs/FIRST_BUILD.md §3 says explicitly: "no
  jumping, no ledges. Keep flat ground as a design constraint — nothing
  planned to change this." This is the same ground that already got the
  crawl/roll/jump locomotion idea rejected
  ([#14](https://github.com/darkwebdev/zombie-emily/issues/14), item 6), and
  floating is a stronger version of exactly that ask, not a milder one.
- **Direct damage from Emily contradicts the game's basic premise.** Her
  stat-level rejection ([#14](https://github.com/darkwebdev/zombie-emily/issues/14),
  item 1) rests on "Emily's only verb does zero damage — she is deliberately
  the weakest thing on screen, and buffing her fights the premise that the
  horde is the power." A move where Emily herself damages enemies is a
  reversal of that, not a variation on it.
- **Throwing every limb at once is the limb ladder's ammo/retrieval economy
  taken to its limit.** ([#2](https://github.com/darkwebdev/zombie-emily/issues/2))
  All limbs gone at once means Emily is fully unarmed and, if she still has
  legs thrown, at reduced speed, until every one is retrieved — a real cost,
  unlike the earlier "throw a follower as a splash weapon" idea that was
  rejected for costing nothing comparable
  ([#14](https://github.com/darkwebdev/zombie-emily/issues/14), item 11).
  Whether the limbs still need individual physical retrieval afterward (in
  which case this pays into the ladder rather than bypassing it) or return
  automatically (in which case it's the auto-return idea already rejected,
  same issue, item 3) is the question that decides whether this is even
  compatible with the ladder at all.
- **"Hit with force" suggests knockback**, which risks the same collision as
  the enemy-pull grapple and the original bulldozer-charge concept — both
  rejected for physically displacing `setImmovable(true)` soldiers out of
  authored positions ([#14](https://github.com/darkwebdev/zombie-emily/issues/14),
  items 4 and 12). The bulldozer's adopted fix — stun instead of displacement,
  applying `PARALYZED` rather than moving anyone
  ([#9](https://github.com/darkwebdev/zombie-emily/issues/9)) — is the
  obvious template if this is pursued, and paralyzing a burst of enemies
  rather than damaging them would also resolve the previous point.
- **"Or a skill of a special follower that enables this" is a new kind of
  special-follower hook.** Every special designed so far
  ([#4](https://github.com/darkwebdev/zombie-emily/issues/4),
  [#6](https://github.com/darkwebdev/zombie-emily/issues/6),
  [#7](https://github.com/darkwebdev/zombie-emily/issues/7)) is a follower
  acting on its own; a follower that unlocks a new action *for Emily* is a
  different shape of thing entirely and isn't covered by the existing
  `canRush`/`damageTakenMult`/`engageRadius`/`spitRange` hook pattern.
- Still open, same as the boss-enemy idea: whether Emily has skills at all
  ([#2](https://github.com/darkwebdev/zombie-emily/issues/2)'s verdict is
  that her only progression is the limb ladder's cost model, not a skill
  grant).

## Boss drop: plush bunny (buff, later a throwable skill)

A specific boss drop — a plush bunny Emily picks up as a buff, later usable as
a thrown skill that weakens enemies or lures them together before exploding
and returning to her. This is a concrete instance of the "Boss enemy at the
end of each level" idea already logged above, not a separate concept, and
should be designed together with it rather than in parallel. It also raises
its own tensions on top of that idea's:

- **"Attract them to it" is the sharpest invariant collision proposed so
  far.** Pulling multiple enemies toward one point is a stronger version of
  the enemy-pull grapple already rejected outright
  ([#14](https://github.com/darkwebdev/zombie-emily/issues/14), item 4) for
  letting a player disassemble every authored encounter — gathering several
  soldiers away from their authored positions is that problem multiplied, not
  a milder case of it. The two existing sanctioned exceptions to "enemies
  never reposition on their own" — a melee soldier answering a Rifleman's
  call for help, and a Commander's reinforcements teleporting in
  ([#12](https://github.com/darkwebdev/zombie-emily/issues/12)) — are both
  bounded and soldier-initiated; this would be player-initiated and
  open-ended, which is exactly the shape the grapple rejection turned on.
- **"Explode and return back" bundles two separate open questions.** The
  explode/weaken effect is new game-state vocabulary (distinct from
  paralyze/damage) and needs its own definition. The auto-return half is the
  same shape of ask already scoped down once for limbs — boomerang-on-a-miss
  only, arms only
  ([#14](https://github.com/darkwebdev/zombie-emily/issues/14), item 3) — and
  an unconditional auto-return here should be reconciled with that reasoning
  explicitly (it may not need the same restriction, since a bunny isn't part
  of the limb ladder's ammo economy, but that has to be argued, not assumed).
- Shares an open question with the airborne-limb-barrage idea just above:
  whether Emily has skills at all, and whether a thrown AoE debuff from Emily
  competes with her "deals zero damage" premise the way that idea's damage
  effect does.

## Puller: drag the farthest enemy into the horde

A special follower (new type, or a new skill on an existing one — undecided)
that pulls the farthest enemy toward the horde, meant to counter long-range
troops and, speculatively, enemy healers if that enemy type is ever built.
This is close kin to an idea already rejected outright:

- **This is structurally the enemy-pull grapple, rescoped.** The grapple that
  pulls enemies was rejected outright
  ([#14](https://github.com/darkwebdev/zombie-emily/issues/14), item 4) for
  physically displacing `setImmovable(true)` soldiers out of their authored
  positions, letting a player disassemble any encounter one soldier at a
  time. Targeting only the single farthest enemy, rather than any enemy the
  player picks, narrows *who* gets pulled but not *whether* pulling itself is
  the problem — the objection was about displacement, not about target
  choice, so this needs to be reconciled with that rejection explicitly, not
  treated as a different idea because the trigger is automatic.
- **A discrete teleport may be the way through, following existing
  precedent** — worth weighing before assuming this needs the same rejection.
  Two mechanics already move a soldier without "enemies reposition on their
  own": a melee soldier's `setX()` teleport to the camera edge when
  answering a Rifleman's call for help, and a Commander's reinforcement
  entrance ([#12](https://github.com/darkwebdev/zombie-emily/issues/12)). Both
  are instant, discrete jumps, not continuous dragging — which is exactly
  the distinction that let the bulldozer charge survive contact with this
  invariant by becoming a stun instead of a shove
  ([#9](https://github.com/darkwebdev/zombie-emily/issues/9)). A Puller that
  teleports its target to a fixed spot near the horde, rather than winching
  it across the screen over time, would fit the pattern those two exceptions
  already establish; a follower physically dragging an enemy across authored
  terrain would not.
- **It risks being the universal answer to ranged enemies**, the same trap
  BULWARK's tier-1 design was deliberately kept narrow to avoid — tier-1
  Bulwark can't break shields specifically so it doesn't become the solution
  to everything, with that reserved for tier-2
  ([#6](https://github.com/darkwebdev/zombie-emily/issues/6),
  [#9](https://github.com/darkwebdev/zombie-emily/issues/9)). A follower that
  can, at will, cancel a Rifleman's whole reason for being dangerous — its
  range — needs the same kind of deliberate limiting (a cooldown, a cost, a
  tier-2 gate) or it flattens the game's hardest existing enemy on demand.
- **New base special vs. new skill on an existing one is exactly the open
  question the roster-cap logic in
  [#5](https://github.com/darkwebdev/zombie-emily/issues/5) already
  anticipates.** The 1:1 item-to-special map caps the roster at the number of
  item types, and SPITTER is already waiting on a 4th item
  ([#11](https://github.com/darkwebdev/zombie-emily/issues/11)) — a new base
  special here would need a 5th. Landing it as a tier-2 skill instead (on
  PORTER, thematically — something that already "fetches" — or on a new
  base special once one exists) fits the tier-2 pattern already established
  for consuming no item ([#8](https://github.com/darkwebdev/zombie-emily/issues/8))
  and avoids growing the item-type count at all.

## No HP: instant loss on contact with an active soldier, followers revive her

Remove `EMILY.maxHp` entirely. Instead of taking damage, Emily goes down the
instant a non-paralyzed (`ACTIVE`) soldier touches her — not a death, an
unconscious state her followers can bring her back from. The motivation is
getting rid of a number that (per the stat-levels rejection below) was already
considered the dullest thing about her. The stated flip side is that this
makes converting paralyzed soldiers "very dangerous" — worth noting precisely:
today a `PARALYZED`/`RECOVERING` soldier deals **zero** contact damage
(`CombatSystem` only applies `contactDamage` from `state === "ACTIVE"`), so
standing on or feeding the soldier being converted is already safe — the
danger being pointed at must be *other* `ACTIVE` soldiers nearby during that
exposure window, which is worth confirming before this goes to design.

- **This reverses an explicit, deliberately-kept design pillar, not just an
  untouched invariant.** docs/FIRST_BUILD.md's cut list keeps "bidirectional
  contact damage" by name specifically because "without it there is no risk,"
  as one of only three things kept despite the cutting pass. Removing HP
  doesn't delete that risk, but it changes its shape from graded (a 10-point
  bar chipped down by 1-2 per hit, softened by 0.6s i-frames) to binary
  (one touch = incapacitated) — a bigger swing on the same pillar than
  anything logged in the rejected-ideas register
  ([#14](https://github.com/darkwebdev/zombie-emily/issues/14)), including
  item 1's verdict that `maxHp` is merely "the only harmlessly scalable [stat]
  and the dullest possible upgrade." That verdict was about raising HP via a
  stat tree, not about deleting the number's whole mechanic — this idea is a
  different and larger move than the thing item 1 actually rejected.
- **The Healer ([#10](https://github.com/darkwebdev/zombie-emily/issues/10))
  is built entirely around this number and would need to be rethought, not
  just retuned.** Its whole design — `healRate`, the `healSuppressAfterDamage`
  gate, `Emily.timeSinceDamage`, the fractional-HP side effects it calls out
  — exists to regenerate graded chip damage without nullifying the game's
  attrition pressure. If Emily has no HP to regenerate, there is nothing left
  for a Healer to do *for Emily* under that design; whatever replaces it
  (speeding up the revive? preventing the incapacitation outright?) is a new
  mechanic wearing the Healer's name, not a retune of #10's numbers.
- **Ranged damage is left unaddressed.** `GunfireSystem` currently applies
  `RIFLEMAN.bulletDamage` to Emily the same way contact damage is applied —
  chip damage against `maxHp`. The idea as stated only covers "a non-paralyzed
  enemy touches her" (contact); it doesn't say what a Rifleman's bullet does
  once there's no HP left to chip. That gap needs an answer before this is
  buildable, not just for contact.
- **"Followers help her return to senses" is a revival mechanic, and its
  mirror image is already logged above in "Resurrect followers."** That entry
  flags that a free revive undercuts the loss that's supposed to sting, and
  the same question applies in reverse here: what triggers the revive
  (automatic proximity, like healing regen, or something followers have to
  actively do), how long it takes, and what it costs — e.g. does Emily stay
  vulnerable to a second knockout, or to nearby soldiers, while she's down and
  followers are working on her? None of that is specified yet, and it's the
  same category of open question the resurrect-followers entry already
  raises for the opposite direction.
- **This changes the limb ladder's risk math, not just its flavor.**
  The ladder ([#2](https://github.com/darkwebdev/zombie-emily/issues/2)) prices
  the leg-throw tradeoff (speed 140 -> ~90 -> ~60 while limbs are detached) against
  *graded* contact damage accumulating during a slower retrieval walk — a
  worse walk currently means more chip damage, not certain incapacitation. If
  any contact with an `ACTIVE` soldier is instant, a mistimed retrieval walk
  at reduced speed goes from "costly" to "almost certainly ends the attempt,"
  which may make the slower ladder tiers unplayable rather than merely riskier
  — worth flagging for whoever designs this, without assuming which way it
  should be resolved.
- Scope note: the idea as phrased ("get rid of unnecessary number (hp)") could
  mean just `EMILY.maxHp`, or the broader concept of HP everywhere (`Follower`,
  `Soldier` both have `hp` too, and the whole paralyze/damage/defenseless-
  multiplier economy is built on soldiers having a graded HP bar). Nothing
  above assumes which scope was meant — that's worth pinning down early in any
  design pass, since the soldier/follower-facing tensions are entirely
  different from the Emily-facing ones listed here.

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
