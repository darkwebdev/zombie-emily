import type { EnemyKind } from "../config/tuning";

// Hand-placed spawns across the 3200px-wide level. No spawner/waves for the
// first build — see docs/FIRST_BUILD.md §3. facing: -1 means facing left,
// i.e. back toward the approaching player — the readable default for a
// shield trooper that hasn't aggroed yet.
export const SPAWNS: { x: number; kind: EnemyKind; facing: 1 | -1 }[] = [
  { x: 380, kind: "STANDARD", facing: -1 },
  { x: 620, kind: "STANDARD", facing: -1 },
  { x: 900, kind: "STANDARD", facing: -1 },
  { x: 1180, kind: "SHIELD", facing: -1 }, // first shield — isolated teaching beat
  { x: 1500, kind: "RIFLEMAN", facing: -1 }, // first rifleman — isolated teaching beat
  { x: 1850, kind: "STANDARD", facing: -1 },
  { x: 2100, kind: "STANDARD", facing: -1 }, // bodyguard for the shield below
  { x: 2250, kind: "SHIELD", facing: -1 }, // second shield — under pressure this time
  { x: 2700, kind: "STANDARD", facing: -1 }, // escort for the rifleman below
  { x: 2900, kind: "RIFLEMAN", facing: -1 }, // second rifleman — fires into the escort's melee
];
