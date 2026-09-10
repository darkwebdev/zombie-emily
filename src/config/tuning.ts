// docs/FIRST_BUILD.md, sections 1, 2 and 4 — single source of truth for numbers.
export const WORLD = {
  width: 320,
  height: 180,
  zoom: 3,
  levelWidth: 3200,
  groundY: 150,
};

export const EMILY = {
  speed: 140,
  feedTime: 2.0,
  maxHp: 10,
  iframeDuration: 0.6,
  deathFadeDuration: 1.2,
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
  slotCost: 1,
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
  slotCost: 2,
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

export const LIMB = {
  throwSpeed: 320,
  throwLift: 120,
  throwCooldown: 0.4,
  gravityY: 600,
  ammoMax: 2,
};

export const AGGRO = {
  max: 1.0,
  fillTime: 12.0,
  rushDuration: 4.0,
  rushAcquireRadius: 480,
  rejectFlashDuration: 0.1,
};

// A slot budget, not a headcount — a base follower costs 1 slot, a Brute
// costs 2 (see FOLLOWER_STATS). Fusion always frees slots (4 base = 4
// slots -> 1 Brute = 2 slots), so it's the pressure valve on this cap.
export const HORDE_CAP = 8;

export const COMBAT = {
  contactRange: 16,
};

export const TRAIL = {
  sampleIntervalMs: 60,
  bufferSize: 120,
  spacingSamples: 6,
};
