import Phaser from "phaser";
import { ANCHORS, AnchorName, CHARACTER_LAYERS, CharacterLayer } from "../entities/characterLayers";
import type { EnemyKind, FollowerKind } from "../config/tuning";
import type { GameScene } from "../scenes/GameScene";

type Kind = EnemyKind | FollowerKind;

/** Live gear fitting.
 *
 * Source art is never drawn at the size or position it occupies on the body —
 * the boards hand us catalogue items sized to uniform cells — so every piece
 * needs an offset and a scale before it sits right. Baking those into the
 * extractor means each adjustment is an edit, a re-run and a reload, which is
 * why fitting one trouser layer took three passes.
 *
 * This moves the numbers to where they can be dragged. Pick a kind and a
 * layer, move the sliders, watch it land on the live character, then copy the
 * result straight into CHARACTER_LAYERS. Debug-only, mounted beside the demo
 * panel under ?debug=1.
 */
export function mountGearFitPanel(game: Phaser.Game, sceneKey: string): void {
  const root = document.createElement("div");
  root.style.cssText = [
    "position:fixed",
    "bottom:12px",
    "left:16px",
    "width:330px",
    "z-index:1000",
    "font-family:monospace",
    "font-size:11px",
    "color:#ddd",
    "background:rgba(10,10,20,0.92)",
    "border:1px solid #555",
    "border-radius:4px",
    "padding:8px 10px",
    "display:flex",
    "flex-direction:column",
    "gap:6px",
  ].join(";");

  const title = document.createElement("div");
  title.style.cssText = "font-weight:bold;color:#6fe3ff;display:flex;justify-content:space-between;cursor:pointer;";
  title.innerHTML = "<span>Gear fitting</span><span>▾</span>";
  root.appendChild(title);

  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:6px;";
  root.appendChild(body);
  title.addEventListener("click", () => {
    const open = body.style.display !== "none";
    body.style.display = open ? "none" : "flex";
    title.lastElementChild!.textContent = open ? "▸" : "▾";
  });

  const row = (label: string, el: HTMLElement): HTMLDivElement => {
    const d = document.createElement("div");
    d.style.cssText = "display:flex;align-items:center;gap:6px;";
    const l = document.createElement("span");
    l.style.cssText = "width:54px;color:#999;flex:none;";
    l.textContent = label;
    d.append(l, el);
    return d;
  };

  const kindSel = document.createElement("select");
  const layerSel = document.createElement("select");
  for (const el of [kindSel, layerSel]) {
    el.style.cssText = "flex:1;background:#1a1a2e;color:#fff;border:1px solid #555;font-family:monospace;font-size:11px;";
  }
  for (const k of Object.keys(CHARACTER_LAYERS) as Kind[]) {
    kindSel.append(new Option(k, k));
  }

  const anchorSel = document.createElement("select");
  anchorSel.style.cssText = kindSel.style.cssText;
  anchorSel.append(new Option("(pre-aligned)", ""));
  for (const a of Object.keys(ANCHORS)) anchorSel.append(new Option(a, a));

  // Range + live readout per tunable. Ranges are deliberately generous: the
  // whole point is that nobody knows the right number in advance.
  const mkSlider = (min: number, max: number, step: number) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex:1;";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.style.cssText = "flex:1;";
    const out = document.createElement("span");
    out.style.cssText = "width:42px;text-align:right;color:#6fe3ff;";
    wrap.append(input, out);
    return { wrap, input, out };
  };

  const dx = mkSlider(-40, 40, 0.5);
  const dy = mkSlider(-60, 60, 0.5);
  const sc = mkSlider(0.2, 3, 0.05);

  const out = document.createElement("textarea");
  out.readOnly = true;
  out.rows = 4;
  out.style.cssText =
    "background:#11111c;color:#8fd98f;border:1px solid #444;font-family:monospace;font-size:10px;resize:vertical;";

  const hint = document.createElement("div");
  hint.style.cssText = "color:#888;font-size:10px;";
  hint.textContent = "Paste into CHARACTER_LAYERS (characterLayers.ts).";

  body.append(
    row("kind", kindSel),
    row("layer", layerSel),
    row("anchor", anchorSel),
    row("dx", dx.wrap),
    row("dy", dy.wrap),
    row("scale", sc.wrap),
    out,
    hint,
  );
  document.body.appendChild(root);

  const scene = (): GameScene => game.scene.getScene(sceneKey) as unknown as GameScene;

  /** The layer array the sliders are editing. Mutating CHARACTER_LAYERS in
   * place is deliberate: every character of that kind re-reads it on the next
   * sync, so one drag updates everything on screen at once rather than a
   * single hand-picked sprite. */
  const specs = (): CharacterLayer[] => CHARACTER_LAYERS[kindSel.value as Kind];

  function refreshLayerList(): void {
    layerSel.innerHTML = "";
    specs().forEach((l, i) => layerSel.append(new Option(`${i}: ${l.texture}`, String(i))));
    // Index 0 is the body; fitting it means moving the character itself, so
    // start on the first piece of gear where there is one.
    layerSel.selectedIndex = Math.min(1, specs().length - 1);
    loadSelected();
  }

  function loadSelected(): void {
    const spec = specs()[Number(layerSel.value)];
    if (!spec) return;
    anchorSel.value = spec.anchor ?? "";
    dx.input.value = String(spec.dx ?? 0);
    dy.input.value = String(spec.dy ?? 0);
    sc.input.value = String(spec.scale ?? 1);
    apply();
  }

  function apply(): void {
    const spec = specs()[Number(layerSel.value)];
    if (!spec) return;
    const anchor = anchorSel.value as AnchorName | "";
    if (anchor) spec.anchor = anchor;
    else delete spec.anchor;
    spec.dx = Number(dx.input.value);
    spec.dy = Number(dy.input.value);
    spec.scale = Number(sc.input.value);

    dx.out.textContent = spec.dx.toFixed(1);
    dy.out.textContent = spec.dy.toFixed(1);
    sc.out.textContent = (spec.scale ?? 1).toFixed(2);

    const parts = [`texture: "${spec.texture}"`];
    if (spec.anchor) parts.push(`anchor: "${spec.anchor}"`);
    if (spec.dx) parts.push(`dx: ${spec.dx}`);
    if (spec.dy) parts.push(`dy: ${spec.dy}`);
    if (spec.scale !== 1) parts.push(`scale: ${spec.scale}`);
    out.value = `{ ${parts.join(", ")} },`;

    // Existing characters built their stacks at construction, so the change
    // only shows once they re-sync — which happens every frame, but a demo
    // that has already settled needs a nudge to redraw immediately.
    const s = scene();
    if (s?.sys?.isActive()) s.resyncCharacterLayers?.();
  }

  for (const el of [dx.input, dy.input, sc.input, anchorSel]) el.addEventListener("input", apply);
  layerSel.addEventListener("change", loadSelected);
  kindSel.addEventListener("change", refreshLayerList);
  refreshLayerList();
}
