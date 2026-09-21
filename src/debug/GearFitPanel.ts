import Phaser from "phaser";
import { ANCHORS, AnchorName, CHARACTER_LAYERS, CharacterLayer } from "../entities/characterLayers";
import type { EnemyKind, FollowerKind } from "../config/tuning";
import type { GameScene } from "../scenes/GameScene";
import { INSPECT, WORLD } from "../config/tuning";
import { getPinZoom, setPinZoom } from "../systems/screenPin";

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
 * panel under ?debug=1. Picking a kind also puts that figure on the bench —
 * the gearFit demo: that one character, alone, frozen, screen-high.
 *
 * It is built to be usable from a phone, because that is where it gets used.
 * On a narrow screen it becomes a bottom sheet (a 16:9 canvas on a portrait
 * screen leaves a black band under it, so the sheet costs no view of the
 * figure), every control is thumb-sized, and each number carries ± buttons —
 * a slider drag can't reliably land on one pixel of dy, which is the unit the
 * whole job is measured in.
 */
export function mountGearFitPanel(game: Phaser.Game, sceneKey: string): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.className = "gf-root";

  const title = document.createElement("div");
  title.className = "gf-title";
  title.innerHTML = "<span>Gear fitting</span><span>▾</span>";
  root.appendChild(title);

  const body = document.createElement("div");
  body.className = "gf-body";
  root.appendChild(body);

  // Remembered across the restart every demo click performs, and across the
  // reload a deep link performs — and defaulting to collapsed on a phone,
  // where an open sheet is most of the screen and the figure is the thing
  // that was asked for.
  const OPEN_KEY = "ze-gearfit-open";
  const setOpen = (open: boolean): void => {
    body.style.display = open ? "flex" : "none";
    title.lastElementChild!.textContent = open ? "▾" : "▸";
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      // Private browsing — the toggle still works, it just isn't remembered.
    }
  };
  title.addEventListener("click", () => setOpen(body.style.display === "none"));

  const row = (label: string, el: HTMLElement): HTMLDivElement => {
    const d = document.createElement("div");
    d.className = "gf-row";
    const l = document.createElement("span");
    l.className = "gf-label";
    l.textContent = label;
    d.append(l, el);
    return d;
  };

  const kindSel = document.createElement("select");
  const layerSel = document.createElement("select");
  const anchorSel = document.createElement("select");
  for (const el of [kindSel, layerSel, anchorSel]) el.className = "gf-sel";
  for (const k of Object.keys(CHARACTER_LAYERS) as Kind[]) kindSel.append(new Option(k, k));
  anchorSel.append(new Option("(pre-aligned)", ""));
  for (const a of Object.keys(ANCHORS)) anchorSel.append(new Option(a, a));

  /** Range + live readout + a ± pair per tunable. Ranges are deliberately
   * generous: the whole point is that nobody knows the right number in
   * advance. The buttons aren't a convenience — on a touch screen they're the
   * only way to move exactly one step without overshooting. */
  const mkSlider = (min: number, max: number, step: number) => {
    const wrap = document.createElement("div");
    wrap.className = "gf-slider";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const out = document.createElement("span");
    out.className = "gf-out";
    const nudge = (delta: number): HTMLButtonElement => {
      const b = document.createElement("button");
      b.className = "gf-nudge";
      b.textContent = delta < 0 ? "−" : "+";
      b.addEventListener("click", () => {
        input.value = String(Phaser.Math.Clamp(Number(input.value) + delta, min, max));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        b.blur();
      });
      return b;
    };
    wrap.append(nudge(-step), input, nudge(step), out);
    return { wrap, input, out };
  };

  const dx = mkSlider(-40, 40, 0.5);
  const dy = mkSlider(-60, 60, 0.5);
  const sc = mkSlider(0.2, 3, 0.05);

  // Camera zoom. The gearFit demo solves its own from the figure's height
  // (INSPECT in tuning.ts), so this is for going closer on one detail or
  // backing out to see the whole figure. Pinned elements (HUD, parallax) are
  // re-seated with it, because Phaser zooms about the camera centre and
  // moving one without the other slides the whole backdrop off.
  const zoom = mkSlider(WORLD.zoom, INSPECT.maxZoom, 0.5);
  zoom.input.value = String(getPinZoom());
  const applyZoom = (): void => {
    const z = Number(zoom.input.value);
    zoom.out.textContent = `${z.toFixed(1)}x`;
    setPinZoom(z);
    const s = scene();
    if (s?.sys?.isActive()) {
      s.cameras.main.setZoom(z);
      // Pinned UI keeps its position through a zoom but not its size, so the
      // HUD balloons over the very characters being inspected. Hide it above
      // the normal zoom and restore it on the way back down.
      s.setHudVisible?.(z <= WORLD.zoom);
    }
  };
  zoom.input.addEventListener("input", applyZoom);

  const out = document.createElement("textarea");
  out.className = "gf-out-box";
  out.readOnly = true;
  out.rows = 2;

  const hint = document.createElement("div");
  hint.className = "gf-hint";
  hint.textContent = "Paste into CHARACTER_LAYERS (characterLayers.ts).";

  body.append(
    row("kind", kindSel),
    row("layer", layerSel),
    row("anchor", anchorSel),
    row("dx", dx.wrap),
    row("dy", dy.wrap),
    row("scale", sc.wrap),
    row("zoom", zoom.wrap),
    out,
    hint,
  );
  document.body.appendChild(root);

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(OPEN_KEY);
  } catch {
    stored = null;
  }
  setOpen(stored === null ? !isNarrow() : stored === "1");

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
  kindSel.addEventListener("change", () => {
    refreshLayerList();
    // Picking a kind here means "this is the figure I'm working on", so it
    // puts that figure on the bench: alone, frozen, screen-high. Whatever
    // demo was running is replaced — this panel exists for one job.
    const s = scene();
    if (!s?.sys?.isActive()) return;
    s.inspectKind = kindSel.value as Kind;
    // The demo solves its own zoom from the figure's height; the slider
    // catches up through followSceneZoom below.
    s.runDemo("gearFit");
  });
  refreshLayerList();
  applyZoom();

  // The scene changes the zoom on its own — the gearFit demo solves one per
  // figure, and every restart drops back to play magnification — so the
  // control follows it rather than lying about where the camera is.
  const followSceneZoom = (): void => {
    const z = getPinZoom();
    if (Number(zoom.input.value) !== z) {
      zoom.input.value = String(z);
      zoom.out.textContent = `${z.toFixed(1)}x`;
    }
    requestAnimationFrame(followSceneZoom);
  };
  requestAnimationFrame(followSceneZoom);
}

/** Matches the CSS breakpoint below; the two have to agree or the panel
 * opens by default on exactly the screens the phone layout is for. */
function isNarrow(): boolean {
  return window.matchMedia("(max-width: 720px)").matches;
}

/* 16px on a <select> in the phone layout is not a style choice: iOS Safari
   zooms the whole page in when a focused control's text is smaller than that,
   and it doesn't zoom back out — which would leave the canvas cropped for the
   rest of the session. Everything tappable is 34px+ for the same class of
   reason: the panel is only useful if a thumb can work it. */
const CSS = `
.gf-root {
  position: fixed;
  bottom: 12px;
  left: 16px;
  width: 330px;
  z-index: 1000;
  font-family: monospace;
  font-size: 11px;
  color: #ddd;
  background: rgba(10, 10, 20, 0.92);
  border: 1px solid #555;
  border-radius: 4px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  -webkit-user-select: none;
  user-select: none;
}
.gf-title {
  font-weight: bold;
  color: #6fe3ff;
  display: flex;
  justify-content: space-between;
  cursor: pointer;
  padding: 2px 0;
}
.gf-body { display: flex; flex-direction: column; gap: 6px; }
.gf-row { display: flex; align-items: center; gap: 6px; }
.gf-label { width: 54px; flex: none; color: #999; }
.gf-sel {
  flex: 1;
  min-width: 0;
  background: #1a1a2e;
  color: #fff;
  border: 1px solid #555;
  font-family: monospace;
  font-size: 11px;
}
.gf-slider { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.gf-slider input { flex: 1; min-width: 0; accent-color: #6fe3ff; }
.gf-out { width: 42px; flex: none; text-align: right; color: #6fe3ff; }
.gf-nudge {
  flex: none;
  width: 26px;
  height: 26px;
  background: #1a1a2e;
  color: #cfcfe6;
  border: 1px solid #555;
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}
.gf-out-box {
  background: #11111c;
  color: #8fd98f;
  border: 1px solid #444;
  font-family: monospace;
  font-size: 10px;
  resize: vertical;
}
.gf-hint { color: #888; font-size: 10px; }

/* Phone: a bottom sheet across the full width — which is also what buys the
   sliders enough travel to be worth dragging at all. */
@media (max-width: 720px) {
  .gf-root {
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    border-radius: 10px 10px 0 0;
    border-width: 1px 0 0 0;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
    /* Sized to sit inside the black band under a 16:9 canvas on a portrait
       phone rather than climbing over the figure. Past that it scrolls. */
    max-height: 46vh;
    overflow-y: auto;
    font-size: 13px;
  }
  .gf-title { font-size: 15px; padding: 6px 0; }
  .gf-row { gap: 8px; min-height: 38px; }
  .gf-label { width: 46px; font-size: 12px; }
  .gf-sel { font-size: 16px; height: 34px; }
  .gf-slider input { height: 34px; }
  .gf-nudge { width: 40px; height: 34px; font-size: 18px; }
  .gf-out { width: 46px; font-size: 13px; }
  .gf-out-box { font-size: 12px; height: 34px; }
  .gf-hint { display: none; }
}
`;
