# Zombie Emily — First Build Spec

> **Historical.** This is the original M1 design spec. Several items listed
> below as "deferred" (RECOVERING, the defenseless multiplier, enemy
> variants, follower fusion) have since been built. Kept for the original
> core-loop framing and tuning rationale — `src/config/tuning.ts` and the
> code are the source of truth for current behavior. See the root
> `CLAUDE.md` for the current architecture.

Stack: TypeScript + Phaser 3 (Arcade physics) + Vite. One scene, flat ground, no build-time asset pipeline.

The hook this build must deliver, end to end: **throw limb → soldier paralyzed → zombie kills/eats it → it converts → horde grows → spend aggro to throw the horde at the next soldier.** Everything not on that path is cut or deferred.

---

## 1. Aggro — single-charge burst

Spend-in-one-go. A rush is a **flat-duration burst with a target locked once, at press time.** No contact-commit logic, no partial spend, no drain, no coast window.

| Constant | Value | Notes |
|---|---|---|
| `AGGRO_MAX` | `1.0` | normalized, not seconds |
| `AGGRO_FILL_TIME` | `12.0s` | constant rate `1/12` per second |
| `AGGRO_FILLS_ONLY_WITH_HORDE` | `true` | fill only while `followerCount > 0`; keeps the bar dark during the intro so "full" always means actionable |
| `RUSH_DURATION` | `4.0s` | global timer, one per burst, not per follower |
| `RUSH_SPEED_MULT` | `1.8` | applied to follower base speed |
| `RUSH_ACQUIRE_RADIUS` | `480px` | measured from each follower at press time |

Rules:

1. Space is accepted **only** when `aggro >= AGGRO_MAX`. Otherwise the press is ignored (flash the bar once; no partial spend).
2. On accept: `aggro = 0`, start one global `rushTimer = 4.0s`.
3. At that instant, **each follower independently** picks the nearest living soldier within 480px and stores it as `rushTarget`. A follower with no soldier in range does not enter RUSH and keeps following the trail.
4. During RUSH a follower ignores the breadcrumb trail entirely and drives straight at `rushTarget.x` at `base * 1.8`. No re-acquire, no steering, no separation.
5. A follower exits RUSH when: the global timer expires, **or** its `rushTarget` dies. On exit it snaps back to FOLLOW and re-attaches to the nearest breadcrumb index. It does **not** pick a new target.
6. Damage during RUSH is ordinary `CombatSystem` contact damage. RUSH grants no damage bonus — its value is closing distance and putting several bodies on one soldier at once.

---

## 2. Combined HP + aggro HUD

One `Graphics` object plus one `Text`, both `setScrollFactor(0)`, `setDepth(1000)`, redrawn in `HudSystem.update()`. Fixed top-left. No world-space bars on anything except the feed progress bar (§3, Feed).

```
(16,16) ┌────────────────────────────┐  220 x 18   HP
        └────────────────────────────┘
(16,42) ┌────────────────────────────┐  220 x 10   AGGRO
        └────────────────────────────┘
(16,58)  HORDE 3                        12px text
```

| Element | Spec |
|---|---|
| Panel backing | optional `#000` at 45% alpha, `(8,8,236,66)`, rounded 4 |
| Bar track | fill `#2a2a2a`, 1px stroke `#000` |
| HP fill | `#c0392b`, width = `220 * hp/maxHp`, drawn left-anchored |
| Aggro fill (charging) | `#e08a1e` |
| Aggro fill (full) | `#6fe3ff`, alpha pulsing 0.65↔1.0 on a 500ms yoyo tween — the only animation in the HUD |
| Aggro fill (rejected press) | flash track to `#ffffff` for 100ms |
| Horde text | `#ffffff`, 12px, `HORDE <n>` |

No portraits, no icons, no damage-flash, no shake. Emily `MAX_HP = 10`.

---

## 3. Simplifications for this build

**Soldier FSM: 5+ states → 3.** `ACTIVE` / `PARALYZED` / `DEAD`. No `RECOVERING`, no separate `ATTACK` state (contact damage lives in `CombatSystem` on an overlap + per-pair cooldown), no `PATROL` vs `CHASE` (one `ACTIVE` behaviour: move toward nearest zombie within `SOLDIER_DETECT = 320px`, else stand still). *Deferred: patrol routes, RECOVERING, ranged attack states.*

**No RECOVERING grace window.** Paralyze is a hard `6.0s` timer; a re-hit sets it back to `6.0s`. Green tint on, tint off. *Deferred to M2: the amber grace window and its refresh semantics.*

**No defenseless x2 multiplier.** Simpler and reads better: **a PARALYZED soldier deals zero contact damage.** Flat damage numbers everywhere. *Deferred: multipliers, execute finishers.*

**Conversion: 2 states → 1.** A single `CONVERTING` state of `1.0s` (soldier sprite tints toward green over the duration, then is destroyed and a follower spawns at its position). Trigger unchanged: only when a zombie (follower or Emily) lands the killing blow. A soldier killed any other way just dies. *Deferred: two-phase corpse/rise animation.*

**Limb return: magnet + failsafe → ammo model.** No proximity magnet, no return flight, no 20s failsafe. Emily carries `LIMB_AMMO_MAX = 2`. A throw spends one. `3.0s` after the thrown limb hits a soldier or lands on the ground, it fades out and the ammo pip returns. Keep the visual hook cheaply: two arm overlay sprites on Emily toggled by ammo count. *Deferred: physical return flight, magnet pickup, manual retrieval.*

**Single enemy type.** `SOLDIER` only. No officers, no ranged, no variants, no HP tiers. *Deferred: M2+.*

**Horde cap 8.** Trail: sample Emily's position every `60ms` into a 120-entry ring buffer; follower `i` targets index `i * 6`. No flocking, no separation, no collision between followers. *Deferred: larger hordes, pooling, spatial hash.*

**No level authoring beyond an array.** One level, 3200px wide, one ground body, camera follows Emily on X only. Soldier spawns are a hand-written `number[]` of X positions in `src/levels/level1.ts`. No waves, no spawner, no procedural placement, no doors or transitions. *Deferred: level format, multiple levels.*

**No save/load, no persistence, no menus.** Boot straight into `GameScene`. Death → 1.2s fade → `scene.restart()`. All soldiers dead → "CLEARED — press R" overlay. *Deferred: localStorage save, title/pause menus.*

**No audio.** *Deferred to M2.*

**No art or asset pipeline.** Solid-colour rectangles generated at runtime via `Graphics.generateTexture()`, or placeholder PNGs imported by Vite. No atlas, no packer, no animation states beyond a horizontal flip. *Deferred: sprite pass.*

**No pathfinding or steering.** Flat ground means all movement is `setVelocityX(dir * speed)`. No avoidance, no jumping, no ledges. *Keep flat ground as a design constraint — nothing planned to change this.*

**Emily stays minimal.** Confirmed: no ordinary attack. No dash, no crouch, no regen. One defensive affordance: `0.6s` invulnerability after taking a hit, otherwise a crowd deletes her instantly. *Deferred: dodge, any melee.*

**No object pooling, no ECS.** ~30 entities max. Entities are `Phaser.Physics.Arcade.Sprite` subclasses with a `state` field; systems are plain classes the scene owns and calls in a fixed order.

**Kept despite the cutting:** the FEED verb (without it there is no first zombie), bidirectional contact damage (without it there is no risk), and one debug affordance — `?debug=1` draws physics bodies and prints each entity's state string above it.

### Feed (kept, trimmed)

Hold `F` within `FEED_RANGE = 48px` of a PARALYZED soldier for `FEED_TIME = 2.0s` → soldier dies, credited to Emily, converts. Cancel on release or on Emily moving. Progress shown as a `32x4` bar above the target soldier — the only world-space UI in the build.

---

## 4. Tuning table (single source of truth: `src/config/tuning.ts`)

| Emily | | Follower | | Soldier | | Limb | |
|---|---|---|---|---|---|---|---|
| speed | 180 | speed | 165 | speed | 100 | throw speed | 420 |
| max HP | 10 | HP | 2 | HP | 6 | damage | 0 (paralyze only) |
| i-frames | 0.6s | bite dmg | 2 | contact dmg | 1 | ammo | 2 |
| feed time | 2.0s | bite cd | 0.6s | contact cd | 1.0s | recharge | 3.0s |
| feed range | 48px | rush mult | 1.8 | detect | 320px | paralyze | 6.0s |

**Invariant to preserve while tuning:** one follower kills a soldier in `3 bites × 0.6s ≈ 1.8s`, and Emily feeds in `2.0s`. Both must fit comfortably inside the `6.0s` paralyze window, including approach time. If paralyze drops below ~4s the core loop stops working.

Follower speed is deliberately below Emily's so the breadcrumb trail is visible rather than a rigid conga line.

---

## 5. Update order

`GameScene.update()` calls, in this order, every frame:

`Input → Emily → Trail → Aggro → Follower → Soldier → Combat → Conversion → Hud`

Aggro runs before Follower so a burst pressed this frame takes effect this frame. Conversion runs after Combat so a kill resolved this frame starts converting immediately.

---

## 6. Milestones

**M0 — Hook proof (no HUD, no risk).** Emily moves; one soldier stands still; throw limb → PARALYZED tint; hold F → feed bar → soldier converts → one follower trails Emily via breadcrumbs. No damage to Emily, no aggro, no HUD. This is the smallest thing that proves the game is interesting. If M0 is not fun, nothing later fixes it.

**M1 — First playable build (everything in this document).** Adds: soldier contact damage and Emily HP; follower auto-attack and follower death; the aggro burst; the combined HUD; ~8 hand-placed soldiers over 3200px; death/restart and a clear condition; the limb ammo model; horde cap 8; `?debug=1`.

**M2 — Deferred bucket, in rough priority order.** RECOVERING grace window → defenseless multiplier → physical limb return with magnet → audio → art pass → enemy variants → save/load and menus → multiple levels → pooling.
