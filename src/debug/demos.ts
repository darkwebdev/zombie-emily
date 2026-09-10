// Shared between GameScene.runDemo() and the DemoPanel buttons, so the
// button labels and the switch cases can't drift out of sync.
export const DEMOS = [
  {
    name: "reset",
    label: "Reset",
    description: "Restarts the scene to a clean initial state.",
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
    name: "limbDrop",
    label: "Limb Drop",
    description:
      "Sticks a limb in a paralyzed soldier and leaves Emily out of ammo, then forces conversion so the limb falls free — it only comes back when she walks over and touches it.",
  },
  {
    name: "hordeCap",
    label: "Horde Cap",
    description:
      "Fills the horde's 8-slot cap with 4 Brutes (2 slots each), then paralyzes one more soldier for them to execute — showing that converting past the cap consumes the body but adds no follower.",
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
