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
export const TRAIL = {
  sampleIntervalMs: 60,
  bufferSize: 120,
  spacingSamples: 6,
};

/** Base followers past which the trail buffer degenerates — see TRAIL. */
export const TRAIL_DEGENERATION_THRESHOLD = Math.floor(
  TRAIL.bufferSize / TRAIL.spacingSamples,
);
