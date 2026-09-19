// docs/FIRST_BUILD.md, sections 1, 2 and 4 — single source of truth for numbers.
export const WORLD = {
  width: 320,
  height: 180,
  zoom: 3,
  levelWidth: 3200,
  groundY: 150,
};

/** The y everything stands on: Emily's y is her centre, and her body is
 * EMILY_SPRITE.bodyHeight (28) tall, so her feet are 14 below it. */
export const GROUND_LINE = WORLD.groundY + 14;

// Parallax layers, cut from the environment board by
// tools/extract_background.py (which documents why they're built the way
// they are). Back to front; `depth` keeps them behind every character.
//
// artScale is source-art pixels per world pixel. It differs per layer
// because the board draws them at different implied scales — the fence
// panel is 117px for something about Emily's height plus a bit, while the
// skyline panels are ~150px for an entire city. 3 puts one texture pixel on
// one screen pixel (as crisp as Emily); 1 blows the art up 3x, which is what
// the distant layers need to cover the sky at all.
//
// Heights aren't listed: each layer is as tall as its own texture divided by
// its artScale, read off the loaded texture so there's no second copy of a
// number the art already decides.
export const BACKGROUND = {
  layers: [
    { key: "bg-far", y: 0, artScale: 1, parallax: 0.15, depth: -100 },
    { key: "bg-mid", y: 16, artScale: 1, parallax: 0.35, depth: -90 },
    { key: "bg-fence", y: GROUND_LINE - 39, artScale: 3, parallax: 0.65, depth: -80 },
    // The street itself: parallax 1 means it tracks the camera exactly, i.e.
    // it sits still in the world like the ground it represents.
    { key: "bg-ground", y: GROUND_LINE, artScale: 3, parallax: 1, depth: -70 },
  ],
};

export const EMILY = {
  // Her one ground speed, and it reads as a walk — walk is her only
  // locomotion cycle.
  // Deliberately above every enemy's speed (SOLDIER 70 is the fastest) so she
  // can always disengage, and below BRUTE's 105 so the slowest follower can
  // still keep station on the trail behind her.
  speed: 95,
  feedTime: 2.0,
  maxHp: 10,
  iframeDuration: 0.6,
  deathFadeDuration: 1.2,
};

// Emily's frames are cut from the hand-authored character board by
// tools/extract_sprites.py — the only image assets in the project; everything
// else is still runtime-generated shapes.
//
// artScale exists because the game renders a 320x180 world at WORLD.zoom = 3.
// A sprite authored at world scale would be blown up into 3x3 blocks, so the
// frames are authored 3x oversized and drawn back down by renderScale: the
// world box stays 40x40, but one texture pixel lands on exactly one screen
// pixel. Keep artScale == WORLD.zoom, and re-run the extraction script if it
// changes. Everything below in world units is unchanged by any of this — the
// art is purely visual, her hitbox is the same 14x28 box at the ground line.
const EMILY_ART_SCALE = 3;

/** World units of ground covered per frame of the 11-frame walk cycle — i.e.
 * her stride length divided across the sheet. EMILY_SPRITE.walkFps is derived
 * from this so cadence always tracks speed; see the comment on walkFps. */
const WALK_ADVANCE_PER_FRAME = 8.75;

export const EMILY_SPRITE = {
  artScale: EMILY_ART_SCALE,
  renderScale: 1 / EMILY_ART_SCALE,
  frameWidth: 40 * EMILY_ART_SCALE,
  frameHeight: 40 * EMILY_ART_SCALE,
  /** Frame row 38 of 40 (the contact row) sits on Emily's y + bodyHeight/2. */
  originY: 0.6,
  // World units.
  bodyWidth: 14,
  bodyHeight: 28,
  // Source-texture pixels, i.e. already multiplied by artScale.
  bodyOffsetX: 13 * EMILY_ART_SCALE,
  bodyOffsetY: 10 * EMILY_ART_SCALE,
  idleFps: 6,
  // The walk cycle's cadence is *derived* from how fast she actually walks, so
  // retuning EMILY.speed can't leave her feet skating over the ground: the
  // stride length stays fixed at WALK_ADVANCE_PER_FRAME and only the frame
  // rate moves with her. The constant is the ground distance the 11-frame
  // sheet (art/emily-walk-sheet.png) was authored to cover per frame.
  walkFps: EMILY.speed / WALK_ADVANCE_PER_FRAME,
  throwFps: 16,
  // Ammo is read off the top-of-screen HUD (see systems/Hud.ts), not off her
  // body — a floating pip readout pinned above her head made the ammo count
  // move around the screen with her, and read as extra limbs sticking out of
  // the art, which already draws both her arms.
  //
  // Debug-only (the anim* demos in src/debug/demos.ts): the walk preview runs
  // at her real arrow-key speed. The pacing window keeps her on screen instead
  // of walking off down the level while you're watching the cycle.
  previewWalkFraction: 1,
  previewPaceHalfWidth: 100,
};
export const FOLLOWER = {
  speed: 125,
  deadzone: 4,
  hp: 2,
  biteDamage: 2,
  biteCooldown: 0.6,
  rushSpeedMult: 1.8,
  engageRadius: 140,
  reach: 16, // matches COMBAT.contactRange — a no-op for base followers
  // How far off a soldier's x a flanking follower parks. Must satisfy
  // flankStandoff + deadzone + max|FLANK.sideJitter| <= sqrt(reach^2 - dy^2),
  // where dy is the worst-case HORDE_SPREAD offset — otherwise a follower
  // that takes a slot stands outside its own bite range and the surround
  // silently costs damage. Base: 8 + 4 + 2 = 14 <= sqrt(16^2 - 6^2) = 14.8.
  flankStandoff: 8,
  hitHalfWidth: 8,
  trailSpacing: 6, // matches TRAIL.spacingSamples
  spawnYOffset: 0,
};

// Four base followers auto-fuse into one Brute the instant the 4th
// appears (see GameScene, right after tickConversions) — no player input.
// Slower and hits less often but much harder: a real HP/DPS tradeoff, not
// a stat-padded follower. Its bite (with the existing 2x defenseless
// multiplier) must one-shot a paralyzed STANDARD (6hp) and SHIELD (9hp) —
// that execute is the whole point, so biteDamage must stay >= 5. Must also
// stay strictly slower than a base follower, or the tradeoff disappears.
export const BRUTE = {
  speed: 105,
  deadzone: 4,
  hp: 12,
  biteDamage: 5,
  biteCooldown: 0.9,
  rushSpeedMult: 1.5,
  engageRadius: 200,
  reach: 20,
  // 10 + 4 + 2 = 16 <= sqrt(20^2 - 2^2) = 19.9. A Brute's spawnYOffset (-4)
  // pulls it back toward a soldier's own line, so its dy is smaller than a
  // base follower's despite the longer reach. See FOLLOWER.flankStandoff.
  flankStandoff: 10,
  hitHalfWidth: 12,
  trailSpacing: 4, // hugs Emily tighter to offset the lower speed
  spawnYOffset: -4, // taller sprite (36 vs 28) — keeps its feet on the ground line
};

export type FollowerKind = "BASE" | "BRUTE";
export const FOLLOWER_STATS: Record<FollowerKind, typeof FOLLOWER> = {
  BASE: FOLLOWER,
  BRUTE: BRUTE,
};

export const FUSION = {
  requiredBase: 4,
};

export const SOLDIER = {
  speed: 70,
  hp: 6,
  paralyzeDuration: 6.0,
  recoveringDuration: 1.2,
  recoveringSpeedMult: 0.5,
  contactDamage: 1,
  contactCooldown: 1.0,
  detectRadius: 320,
  defenselessDamageMult: 2,
  shielded: false,
  shieldStagger: 0,
  deflectBounceX: 0,
  deflectBounceY: 0,
  // Ranged weapon fields — 0 means "no gun", see RIFLEMAN.
  fireRange: 0,
  minFireRange: 0,
  aimDuration: 0,
  fireCooldown: 0,
  bulletSpeed: 0,
  bulletDamage: 0,
  bulletRange: 0,
  // How long this kind commits to a facing after turning, seconds. A soldier
  // faces the nearest zombie, so before this existed two followers on
  // opposite sides at near-equal distance made it flip every single frame —
  // visual noise that reads as a broken figure, and for a Shield Trooper a
  // defence decided by sub-pixel luck. See Soldier.faceToward for the rules
  // that stop it feeling broken: the FIRST turn is always free (this is a
  // cooldown after turning, never a dwell before it), a request to face the
  // way it already faces doesn't restart the clock, a walking soldier is
  // exempt (it would moonwalk), and paralyze() clears it.
  // Nothing directional depends on a STANDARD's facing, so this is pure
  // legibility: long enough to read as a deliberate turn, short enough that
  // it never looks stuck while Emily circles it.
  turnCooldown: 0.5,
  // 0 means "never calls for help" — see RIFLEMAN.
  callForHelpRadius: 0,
};

// A directional shield: a limb hitting the shielded side deflects instead
// of paralyzing, unless it's caught in RECOVERING (shield drops). Same
// stat shape as SOLDIER so both share Soldier.stats — see entities/Soldier.ts.
export const SHIELD_TROOPER = {
  speed: 55,
  hp: 9,
  paralyzeDuration: 6.0,
  recoveringDuration: 1.2,
  recoveringSpeedMult: 0.5,
  contactDamage: 2,
  contactCooldown: 1.2,
  detectRadius: 260,
  defenselessDamageMult: 2,
  shielded: true,
  shieldStagger: 0.5,
  deflectBounceX: 90,
  deflectBounceY: -80,
  fireRange: 0,
  minFireRange: 0,
  aimDuration: 0,
  fireCooldown: 0,
  bulletSpeed: 0,
  bulletDamage: 0,
  bulletRange: 0,
  // The longest in the game: this is the one kind whose facing IS a defence,
  // so committing to it is what makes going around the back worth doing. The
  // horde pulling it round exposes its unshielded side for at least this long
  // even after it loses the position.
  turnCooldown: 1.0,
  callForHelpRadius: 0,
};

// A standoff shooter: advances beyond fireRange, backs off inside
// minFireRange, holds and fires between the two. contactDamage 0 — closing
// the distance is total immunity, that's the point. fireRange (130) is
// deliberately kept under two invariants: the camera's 160px viewport
// half-width (never shoots from off-screen) and the limb's ~138px throw
// reach (Emily can always throw back if it can shoot her). Don't raise
// fireRange past ~130 without re-checking both.
export const RIFLEMAN = {
  speed: 60,
  hp: 4,
  paralyzeDuration: 6.0,
  recoveringDuration: 1.2,
  recoveringSpeedMult: 0.5,
  contactDamage: 0,
  contactCooldown: 1.0,
  detectRadius: 260,
  defenselessDamageMult: 2,
  shielded: false,
  shieldStagger: 0,
  deflectBounceX: 0,
  deflectBounceY: 0,
  fireRange: 130,
  minFireRange: 48,
  aimDuration: 0.9,
  fireCooldown: 1.6,
  bulletSpeed: 260,
  bulletDamage: 2,
  bulletRange: 200,
  // The shortest, which looks backwards until you notice it already has the
  // strongest commitment in the game: isAiming freezes its facing for the
  // whole 0.9s windup, so this only covers the gaps between shots. Keeping it
  // small also avoids locking a committed shot in a stale direction —
  // tickWeapon captures lockedAimDir from `facing` when a windup starts.
  turnCooldown: 0.3,
  // While RECOVERING (gun down, vulnerable), it calls any melee soldier
  // within this radius to break its usual stand-still and come guard it —
  // reverts the instant it leaves RECOVERING (converts, dies, or times
  // back to ACTIVE). See GameScene.updateSoldierTargeting.
  callForHelpRadius: 260,
};

export type EnemyKind = "STANDARD" | "SHIELD" | "RIFLEMAN";
export const ENEMY_STATS: Record<EnemyKind, typeof SOLDIER> = {
  STANDARD: SOLDIER,
  SHIELD: SHIELD_TROOPER,
  RIFLEMAN: RIFLEMAN,
};

export const SHIELD_FLASH_DURATION = 0.15;

// Enemy and follower art, cut from the second hand-authored board by
// tools/extract_enemies.py (which documents the three rules it follows). Same
// 3x oversizing as Emily's frames and for the same reason — see the comment
// on EMILY_ART_SCALE.
//
// Nothing here changes gameplay. Every hitbox below is the exact world box the
// runtime-generated rectangle it replaces used to be, so swapping in the art
// can't shift a single range check; the art is drawn around that box, bottom-
// centred on it, rather than the box being fitted to the art. The figures are
// all wider than their hitboxes (the Brute especially, since the board draws
// its bulk as width), which is deliberate: reach is what the player is being
// asked to read, and reach is the box.
export const CHARACTER_ART = {
  artScale: EMILY_ART_SCALE,
  renderScale: 1 / EMILY_ART_SCALE,
  hitbox: {
    STANDARD: { width: 12, height: 28 },
    SHIELD: { width: 16, height: 28 },
    RIFLEMAN: { width: 10, height: 28 },
    BASE: { width: 12, height: 28 },
    BRUTE: { width: 20, height: 36 },
  } as Record<EnemyKind | FollowerKind, { width: number; height: number }>,
};

export const LIMB = {
  // Square hitbox kept from when the limb was an 8x8 rectangle — the arm art
  // that replaced it is wider, but the throw was tuned against this box.
  hitboxSize: 8,
  throwSpeed: 320,
  throwLift: 120,
  throwCooldown: 0.4,
  gravityY: 600,
  ammoMax: 2,
  // The overhead down-arrow that marks where a thrown limb is. Sits on one
  // fixed line for every limb rather than a fixed distance above each, so the
  // markers read as a row of pointers to scan along. That line is clear of
  // every character's head, so a marker can never be mistaken for something
  // attached to a body.
  marker: {
    width: 7,
    height: 6,
    color: 0xffd54a,
    y: GROUND_LINE - 56,
    depth: 50,
    bobAmplitude: 1.5,
    bobSpeed: 3,
  },
};

// Screen-space layout for the fixed top-left panel (systems/Hud.ts). Only the
// ammo readout is listed: the HP/aggro bar geometry predates this block and
// still lives inline there. Coordinates are screen pixels, unzoomed.
export const HUD = {
  ammoLabelX: 150,
  ammoPipX: 196,
  ammoPipY: 59,
  ammoPipWidth: 16,
  ammoPipHeight: 10,
  ammoPipGap: 4,
  ammoPipColor: 0xd9b382,
  ammoPipEmptyColor: 0x2a2a2a,
};

export const AGGRO = {
  max: 1.0,
  fillTime: 12.0,
  rushDuration: 4.0,
  rushAcquireRadius: 480,
  rejectFlashDuration: 0.1,
};

const CONTACT_RANGE = 16;

export const COMBAT = {
  contactRange: CONTACT_RANGE,
  // Limb pickup differs from every other contact check in two ways, both
  // because a limb is a wide object lying on the floor rather than a
  // character standing on it:
  //
  // - It's measured **horizontally only**. Everything stands on one ground
  //   line, so vertical separation between entities is just sprite-centre
  //   bookkeeping — Emily's centre is 14 above her feet, a limb's is ~3. A
  //   centre-to-centre measure spends 11 of the 16 units on that offset and
  //   fails exactly when she is standing on top of the limb.
  // - It's measured to the limb's nearest **edge**, not its centre. The arm
  //   art is 16 wide; a limb embedded in a soldier Emily is feeding on sits
  //   ~17 from her centre but is physically touching her.
  limbPickupRange: CONTACT_RANGE,
};

// The horde is uncapped by design (see docs/PROGRESSION.md §1) — automatic
// fusion is the only compressor, and it keeps growth sub-linear. The one
// real ceiling is structural, not designed: a follower at rank N reads the
// sample N * trailSpacing back, so once bufferSize / spacingSamples is
// exceeded (~20 base followers) targetXForOffset's clamp hands every
// further follower the same oldest sample and they pile up at one x.
// It's a diagnostic threshold (see the ?debug=1 warning in GameScene),
// not a cap to enforce — don't reintroduce a headcount limit.
// How the horde is spread out so it can actually be counted. Followers used
// to share one ground line and had no depth sorting at all, so a cluster of
// them merged into a single silhouette and the player couldn't read their own
// horde size. Each follower now stands a few pixels further down the street
// than the line Emily and the soldiers walk on, and characters draw
// front-to-back by that line.
//
// The offsets are a fixed scrambled table indexed by a per-follower seed, not
// Math.random(): the debug suite asserts against the live scene, so a value
// re-rolled every run would make position-sensitive tests flaky. It's also
// deliberately NOT derived from `rank` — rank shifts down when a follower
// ahead dies or fuses, which would make everyone behind it pop vertically.
//
// The band only ever runs DOWNWARD, toward the camera — never up. The street
// (BACKGROUND's "bg-ground" layer) is drawn starting *at* GROUND_LINE and
// extends down to the bottom of the viewport, so GROUND_LINE isn't the middle
// of the road, it's its back edge. The first version of this band was
// symmetric (±4) and a follower that drew a negative offset stood four pixels
// above the tarmac, on the fence — reading exactly as "hanging in the air,
// ignoring the floor". Keeping every offset >= 0 means a follower can only
// ever stand further forward on a road that is really there.
//
// The band is tiny on purpose. It has to stay small enough that the depths it
// produces sit below LIMB.marker.depth (50) and above the background layers
// (-70 and back), that the whole band fits inside the street's own height
// (16 world px), and small enough not to matter to contact geometry:
// CombatSystem measures centre-to-centre, so an offset of dy shrinks a
// follower's horizontal reach to sqrt(reach^2 - dy^2) — worst case 1.16px for
// a base follower at the front of the band, and less for a Brute, whose
// spawnYOffset (-4) happens to pull it back toward a soldier's own line.
export const HORDE_SPREAD = {
  /** How far down the street a follower can stand, world px. Always forward
   * of GROUND_LINE, never behind it — see the note above. */
  yBand: 6,
  /** Indexed by the follower's seed. Scrambled rather than sequential so
   * consecutive spawns don't line up into a visible staircase. */
  offsets: [0, 4, 2, 6, 1, 5, 3, 6, 2, 5],
  /** Horizontal offsets, world px, applied to the trail-follow target only.
   * A rushing or engaging follower converges on a *flank slot* instead (see
   * FLANK), which has its own small bounded jitter sized against bite reach —
   * this table is far too wide to use in a fight without pushing followers
   * out of range of what they're biting.
   *
   * These have to be comparable to a figure's *width* (a base follower is
   * ~22px wide, a Brute ~31px) to do anything: the first attempt used ±4 and
   * a stopped horde still drew as one blob, because the whole line collapses
   * onto the leader's x the moment she stops and 4px of scatter is a fifth of
   * a body. This is what actually makes a resting horde countable; the
   * vertical band above is what keeps the figures from occluding each other
   * where they do still overlap.
   *
   * A different length to `offsets` on purpose, and coprime with it, so the
   * two tables don't cycle in lockstep — 7 x 10 gives 70 distinct positions
   * before any two followers can land on the same spot. */
  xOffsets: [0, 13, -7, 20, -17, 6, -13],
};

/** Draw depth for Emily and the soldiers. They stand on the canonical
 * GROUND_LINE, which is now the *back* edge of the horde's band, so sorting
 * them strictly by their feet would bury them behind every follower. Both are
 * figures whose state the player has to be able to read at a glance — Emily
 * because she's the one being aimed, a soldier because its paralyze and aim
 * tints are the whole tell — so they draw in front of the horde instead. The
 * lie is at most HORDE_SPREAD.yBand px deep and nobody can see it. */
export const CHARACTER_FRONT_DEPTH = HORDE_SPREAD.yBand + 1;

/** Draw depth for thrown limbs and bullets. Characters sit in the depth band
 * HORDE_SPREAD puts them in, so a projectile left at the default 0 would be
 * swallowed by any follower standing a pixel nearer the camera. Above every
 * character, below LIMB.marker.depth (50). */
export const PROJECTILE_DEPTH = 10;

// Surrounding. Followers used to all steer at a soldier's exact x, so they
// piled onto whichever side they arrived from — always the same side, since
// they trail Emily — and a gang-up read as a queue rather than a mob.
// Engaging followers now take a side and park a standoff off the soldier's
// centre, so a fight visibly closes in from both directions.
//
// Sides are shared, not exclusive seats: any number of followers can hold
// one, so total damage on a single target is exactly unchanged. Exclusive
// seats would have capped a gang-up at about two biters, which is a direct
// contradiction of the uncapped-horde decision (docs/PROGRESSION.md section 1).
//
// A follower LATCHES its side for as long as it keeps the same target. That
// latch is the whole anti-oscillation guarantee: picking a side fresh each
// frame would make two followers at near-equal distance swap sides forever.
// Sides are chosen by whichever currently has fewer followers on it, counted
// live from the followers themselves, so the balance survives deaths mid
// fight — and deliberately NOT from `rank`, which shifts when a follower
// ahead dies (the lesson from the horde-spread work).
export const FLANK = {
  /** Below this many followers on one soldier, nobody flanks — a lone
   * follower still walks straight at it. "Attacking in numbers" is meant
   * literally: one zombie doesn't surround anything. The threshold is
   * upgrade-only, so a follower that already took a side keeps it when its
   * partner dies rather than stepping back to centre. */
  minEngagers: 2,
  /** Small per-follower variation on the standoff so two followers sharing a
   * side don't stand in exactly the same spot. Bounded well inside the
   * reach budget in FOLLOWER.flankStandoff — this is a nudge, not the
   * horde-spread scatter. Length 5 is coprime with HORDE_SPREAD's tables
   * (10 and 7) so the three don't cycle together. */
  sideJitter: [0, 2, -2, 1, -1],
};

export const TRAIL = {
  sampleIntervalMs: 60,
  bufferSize: 120,
  spacingSamples: 6,
};

/** Base followers past which the trail buffer degenerates — see TRAIL. */
export const TRAIL_DEGENERATION_THRESHOLD = Math.floor(
  TRAIL.bufferSize / TRAIL.spacingSamples,
);
