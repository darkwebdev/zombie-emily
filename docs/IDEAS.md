# Future Ideas

Not scoped or designed yet — just captured so they don't get lost. Pull one
into an actual design pass (planner agent) when ready to build it.

(Follower fusion, formerly listed here, has been built — 4 base followers
auto-merge into a Brute; see `FUSION`/`BRUTE` in `src/config/tuning.ts` and
`GameScene.checkFusion()`.)

## Loot from converted enemies
Converting a soldier has a chance to drop an item, building an inventory
over a run. Needs design: what items exist, how they're collected (auto-pickup
like limbs, or a separate mechanic), and what they're for — likely feeds
directly into the special-zombie idea below.

## Special zombie types via items
Depending on what's in the inventory, a follower-fusion could produce a
*specific* special zombie instead of a generic bigger one — e.g. a Healer
that continuously restores Emily's HP. Implies a small set of named fusion
recipes (item combo → zombie type) rather than one generic merge. Needs
design: what special types exist beyond Healer, how recipes are chosen/shown
to the player, and balance against the existing paralyze-economy (a Healer
changes Emily's risk calculus significantly — reduces the cost of standing
in the open).
