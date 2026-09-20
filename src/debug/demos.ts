// Shared between GameScene.runDemo() and the DemoPanel buttons, so the
// button labels and the switch cases can't drift out of sync.
export const DEMOS = [
  {
    name: "reset",
    label: "Reset",
    description: "Restarts the scene to a clean initial state.",
  },
  {
    name: "animIdle",
    label: "Anim: Idle",
    description:
      "Emily alone on an empty stretch of level, standing still — just the idle cycle. Her ammo reads out on the top-of-screen HUD, not on her.",
  },
  {
    name: "animWalk",
    label: "Anim: Walk",
    description:
      "Walks Emily at her real arrow-key speed (EMILY.speed), pacing a window around where she started — watch the cycle, and the sprite flipping when she turns. Walk is her only locomotion cycle.",
  },
  {
    name: "animThrow",
    label: "Anim: Throw",
    description:
      "Replays the one-shot throw animation on a loop, standing still. Cosmetic only — no ammo is spent and no limb is spawned, so the cycle can be watched as long as you like.",
  },
  {
    name: "artRoster",
    label: "Art: Roster",
    description:
      "One of every enemy and follower kind lined up beside Emily, all ACTIVE and untinted, so the art can be compared at the scale it actually plays at. Also the guard on the art not moving anything: every figure's feet sit on the ground line and every hitbox is still the exact world box its old rectangle was.",
  },
  {
    name: "paralyze",
    label: "Paralyze",
    description:
      "Paralyzes a soldier standing in contact range of Emily, to watch the green tint, the 6s timer, and confirm it can't hit her back while paralyzed.",
  },
  {
    name: "recovering",
    label: "Recovering",
    description:
      "Fast-forwards a paralyzed soldier past its 6s timer into the amber RECOVERING stagger, where it stands with its guard down — still re-paralyzable by another limb hit — until it snaps back to ACTIVE.",
  },
  {
    name: "feed",
    label: "Feed / Convert",
    description:
      "Paralyzes a soldier and places Emily in contact, so the automatic 2s feed-and-convert triggers immediately.",
  },
  {
    name: "defenseless",
    label: "Defenseless Dmg",
    description:
      "Spawns a follower on top of a paralyzed soldier, clear of Emily, to show the 2x bite damage against a helpless target — and that a helpless target lands nothing back.",
  },
  {
    name: "aggroReady",
    label: "Aggro Ready",
    description: "Gives Emily two followers and a full aggro meter — press Space to trigger the horde rush.",
  },
  {
    name: "limbMiss",
    label: "Limb Miss",
    description:
      "Emily throws into an empty stretch of level with nothing to hit, so the limb arcs down and settles flat on the ground line — plus the overhead down-arrow marker that shows where every thrown limb is.",
  },
  {
    name: "limbAutoPickup",
    label: "Limb Auto-Pickup",
    description:
      "Emily throws point-blank at an active soldier, so the limb sticks in it while she's touching both. It stays out of reach while it's holding the soldier paralyzed, then drops straight back into her hand the moment the conversion ends it — no walking back over it.",
  },
  {
    name: "limbDrop",
    label: "Limb Drop",
    description:
      "Sticks a limb in a paralyzed soldier and leaves Emily out of ammo, then forces conversion so the limb falls free — it only comes back when she walks over and touches it.",
  },
  {
    name: "uncappedHorde",
    label: "Uncapped Horde",
    description:
      "Spawns 4 Brutes — exactly what the old 8-slot cap used to allow — then paralyzes one more soldier for them to execute. The horde is uncapped now, so that conversion adds a 5th follower instead of consuming the body for nothing.",
  },
  {
    name: "hordeSpread",
    label: "Horde: Spread",
    description:
      "Eight followers (a Brute plus seven base) bunched into the space a stopped horde collapses into. Before the depth band they drew as one silhouette and the horde couldn't be counted — here every figure stands on its own line a few px nearer or further down the street, and they draw front-to-back by that line.",
  },
  {
    name: "hordeFlank",
    label: "Surround: Standard",
    description:
      "Two fights side by side, no input needed. On the left, two followers break off on their own and split across both sides of their soldier instead of queueing up on the side they arrived from — the one that starts NEAREST is the one sent through to the far side, because that's the assignment that finishes first (the trailer then only has to walk to the near slot it was already heading for). On the right, one follower on its own soldier stays below the threshold and still walks straight at its centre.",
  },
  {
    name: "flankGunner",
    label: "Surround: Rifleman",
    description:
      "The same two-follower gang-up against a Rifleman instead. Watch how little of it you get to see: a Rifleman has 4 HP and two base followers bite for 2 each, so it dies at roughly the same moment the crossing lands (~530ms). Nothing is broken here — the sides are assigned on the first frame and the crosser covers the whole distance; the fight is simply shorter than the walk. Under the old 'tie goes to the side you're already on' rule this one never surrounded at all.",
  },
  {
    name: "flankShield",
    label: "Surround: Shield (paralyzed)",
    description:
      "A Shield Trooper paralyzed first, then ganged up on by two base followers — the intended way to take one. It's the longest surround in the game to watch: 9 HP under a paralyze that stops it hitting back, so the pair get either side of it, park at their standoff facing inward, and stay there for about half a second of biting before it goes down.",
  },
  {
    name: "flankShieldActive",
    label: "Surround: Shield (no paralyze)",
    description:
      "The same gang-up on a Shield Trooper that is still ACTIVE, i.e. the mistake. Its contact damage (2) is exactly a base follower's whole HP, so it one-shots each of them as they arrive and walks away from the fight with 3 HP left. The surround mechanic works fine — the sides still latch — but the horde loses. This is the pressure the paralyze is the answer to, and it's why the demo above exists as a separate scenario.",
  },
  {
    name: "flankBrutes",
    label: "Surround: Brute pair",
    description:
      "Two Brutes on one Shield Trooper. The side assignment is kind-agnostic — the nearer Brute is sent across exactly as a base follower would be — but a Brute bites for 5, so two of them kill a 9 HP Shield in two bites, before the one that was sent round has finished walking. Surrounding is in practice a base-follower manoeuvre: a Brute pair overkills every enemy in the game faster than anyone can get behind it.",
  },
  {
    name: "flankBothSides",
    label: "Surround: Already either side",
    description:
      "Two followers that are already standing on opposite sides of a (paralyzed) Shield Trooper before the fight starts — one of them got there by walking past it. Nobody crosses: the side each takes is the side it is already on, because the far side is covered and nothing is gained by walking through the target. 'The nearest one goes across' only decides the case where everyone arrived from the same side.",
  },
  {
    name: "flankMixed",
    label: "Surround: Mixed roster",
    description:
      "One base follower and one Brute sharing a (paralyzed) Shield Trooper, with the base follower nearest. Two things to look at: the light unit is the one sent across — the rule picks by distance, not by kind or rank — and the two park at different standoffs, 8px for the base follower and 10px for the Brute, each budgeted against its own bite reach so neither loses damage by standing off.",
  },
  {
    name: "flankOverflow",
    label: "Surround: Overflow",
    description:
      "Three base followers already in biting range of one paralyzed Shield Trooper, unevenly split so one side holds two of them. This is the case the front-slot cap exists for: a follower that has flanked draws in front of the soldier it's biting, but only FLANK.frontSlotsPerSide of them per side — the rest keep their band depth and stay behind it. Without the cap a pile-on would bury the soldier completely and hide the paralyze tint that says it's safe to eat; with it, the first arrival on each side is visible and the overflow is the part that's occluded.",
  },
  {
    name: "death",
    label: "Death",
    description: "Drops Emily to 1 HP next to an active soldier, so its next hit triggers the death fade and restart.",
  },
  {
    name: "cleared",
    label: "Cleared",
    description: "Instantly converts every remaining soldier, to trigger the CLEARED win screen.",
  },
  {
    name: "shieldBlock",
    label: "Shield Block",
    description:
      "Spawns a shield trooper facing Emily — throw at it to watch the frontal deflect bounce the limb back toward her instead of paralyzing.",
  },
  {
    name: "shieldFlank",
    label: "Shield Flank",
    description:
      "Spawns a shield trooper plus two followers and a full aggro meter — press Space to send the horde around it and expose its back.",
  },
  {
    name: "gunnerShot",
    label: "Gunner Shot",
    description:
      "Spawns a Rifleman in range of a stationary Emily — watch the windup, the red aim lane, and the hit. Throw at it to interrupt the shot.",
  },
  {
    name: "gunnerBlock",
    label: "Gunner Block",
    description:
      "A follower charges the Rifleman and eats its shot instead of Emily — consumable cover in one hit. It closes rather than holding the lane: engageRadius (140) is wider than fireRange (130), so any follower a gunner can shoot is already running at it.",
  },
  {
    name: "gunnerRush",
    label: "Gunner Rush",
    description:
      "Spawns a Rifleman plus two followers and a full aggro meter — press Space to send the horde ahead of Emily to close the lane.",
  },
  {
    name: "fusionAuto",
    label: "Fusion (Auto)",
    description: "Spawns 4 base followers — no key press, they auto-merge into one Brute on the very next frame.",
  },
  {
    name: "bruteExecute",
    label: "Brute Execute",
    description: "A Brute next to a paralyzed shield trooper — one bite (5 dmg x2 defenseless) one-shots its 9 HP.",
  },
  {
    name: "bruteVsGunner",
    label: "Brute Vs Gunner",
    description:
      "A Brute near a Rifleman — its wide engage radius pulls it in fast enough to kill a lone gunner (4 HP, 5 dmg bite) before it can even finish a windup. If it does get shot, 12 HP means it shrugs off several hits a base follower couldn't survive one of.",
  },
  {
    name: "fusionViaCombat",
    label: "Fusion Via Combat",
    description:
      "3 followers autonomously kill a nearby soldier — the 4th follower from that conversion triggers auto-fusion live, no pre-spawned setup.",
  },
  {
    name: "callForHelp",
    label: "Call For Help",
    description:
      "A Rifleman starts RECOVERING with an idle STANDARD soldier nearby — watch the melee soldier break its usual stand-still and walk over to guard it.",
  },
] as const;

export type DemoName = (typeof DEMOS)[number]["name"];

/** The panel renders these as collapsible branches rather than one flat
 * column of ~20 buttons — with every demo visible at once, finding the one
 * you want meant reading every label. Order here is the order on screen.
 *
 * "reset" is deliberately absent: it's the clean-slate action rather than a
 * scenario, so the panel keeps it as a top-level button next to the test
 * runner. Every other demo must appear in exactly one branch — the assertion
 * below fails loudly at import time if a newly added demo is left out. */
export const DEMO_GROUPS = [
  {
    label: "Animation",
    demos: ["animIdle", "animWalk", "animThrow", "artRoster"],
  },
  {
    label: "Core loop",
    demos: ["paralyze", "recovering", "feed", "defenseless"],
  },
  {
    label: "Limbs & ammo",
    demos: ["limbMiss", "limbAutoPickup", "limbDrop"],
  },
  {
    label: "Horde & aggro",
    demos: ["aggroReady", "uncappedHorde", "hordeSpread"],
  },
  {
    label: "Surrounding a soldier",
    demos: [
      "hordeFlank",
      "flankGunner",
      "flankShield",
      "flankShieldActive",
      "flankBothSides",
      "flankBrutes",
      "flankMixed",
      "flankOverflow",
    ],
  },
  {
    label: "Fusion & Brutes",
    demos: ["fusionAuto", "fusionViaCombat", "bruteExecute", "bruteVsGunner"],
  },
  {
    label: "Shield Troopers",
    demos: ["shieldBlock", "shieldFlank"],
  },
  {
    label: "Riflemen",
    demos: ["gunnerShot", "gunnerBlock", "gunnerRush", "callForHelp"],
  },
  {
    label: "Run end states",
    demos: ["death", "cleared"],
  },
] as const satisfies readonly { label: string; demos: readonly DemoName[] }[];

/** The standalone button above the branches — see DEMO_GROUPS. */
export const UNGROUPED_DEMO: DemoName = "reset";

{
  const grouped = DEMO_GROUPS.flatMap((g) => g.demos as readonly DemoName[]);
  const missing = DEMOS.map((d) => d.name).filter(
    (n) => n !== UNGROUPED_DEMO && !grouped.includes(n),
  );
  const duplicated = grouped.filter((n, i) => grouped.indexOf(n) !== i);
  if (missing.length || duplicated.length) {
    throw new Error(
      `DEMO_GROUPS out of sync with DEMOS — ungrouped: [${missing}], duplicated: [${duplicated}]`,
    );
  }
}
