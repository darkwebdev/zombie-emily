/** On-screen controls for touch devices.
 *
 * Deliberately built as a DOM overlay rather than Phaser game objects. The
 * canvas is a fixed WORLD.zoom-scaled render target that the Scale Manager
 * then stretches to fit the viewport (see main.ts), so anything drawn inside
 * it is subject to that scaling *and* to the camera zoom that screenPin.ts
 * exists to cancel out. HTML buttons sit outside all of that: they stay a
 * constant, thumb-sized physical size on any display, regardless of how the
 * game is being scaled underneath them.
 *
 * Input is additive — these set the same state the keyboard sets, and
 * GameScene ORs the two together, so nothing here takes anything away from
 * the keyboard path. */

/** Held directions are read every frame; the three actions are edge-triggered
 * and consumed exactly once, mirroring Phaser's JustDown semantics. */
interface TouchInput {
  left: boolean;
  right: boolean;
  throwQueued: boolean;
  rushQueued: boolean;
  restartQueued: boolean;
}

const state: TouchInput = {
  left: false,
  right: false,
  throwQueued: false,
  rushQueued: false,
  restartQueued: false,
};

export const touchInput = {
  get left(): boolean {
    return state.left;
  },
  get right(): boolean {
    return state.right;
  },
  /** True once per press, then false until the next press — so a held
   * throw button fires one limb, not one per frame. */
  consumeThrow(): boolean {
    const v = state.throwQueued;
    state.throwQueued = false;
    return v;
  },
  consumeRush(): boolean {
    const v = state.rushQueued;
    state.rushQueued = false;
    return v;
  },
  consumeRestart(): boolean {
    const v = state.restartQueued;
    state.restartQueued = false;
    return v;
  },
  /** Test hook — drives the same state a real touch would. */
  __setForTest(patch: Partial<TouchInput>): void {
    Object.assign(state, patch);
  },
  /** Clears everything, including queued edges. Used when the scene restarts
   * so a press that outlived the previous run can't leak into the next one. */
  reset(): void {
    state.left = false;
    state.right = false;
    state.throwQueued = false;
    state.rushQueued = false;
    state.restartQueued = false;
  },
};

/** `?touch=1` forces the controls on (so they can be checked on a desktop),
 * `?touch=0` forces them off; otherwise they appear only on devices whose
 * primary pointer is coarse — i.e. a finger. A laptop with a touchscreen
 * still reports `fine` for its mouse, so it correctly gets no overlay. */
function shouldShowControls(): boolean {
  const forced = new URLSearchParams(location.search).get("touch");
  if (forced === "1") return true;
  if (forced === "0") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

const STYLE = `
.tc-root {
  position: fixed;
  inset: 0;
  z-index: 10;
  /* The overlay itself must never eat taps — only the buttons do. */
  pointer-events: none;
  /* Respect notches/home indicators on phones. */
  padding: 0 max(12px, env(safe-area-inset-left)) max(14px, env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-right));
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
/* Generous gaps rather than the minimum that fits: thumbs are imprecise and
   every button here is destructive-ish to mispress (a stray THROW wastes a
   limb and starts a retrieval walk). */
.tc-cluster { display: flex; gap: 28px; align-items: flex-end; }
.tc-btn {
  pointer-events: auto;
  /* touch-action:none is what stops a drag on the button from scrolling or
     pull-to-refreshing the page mid-game. */
  touch-action: none;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  background: rgba(20, 20, 30, 0.45);
  color: rgba(255, 255, 255, 0.85);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}
.tc-btn.tc-wide { width: 112px; border-radius: 44px; }
.tc-btn.tc-held {
  background: rgba(120, 200, 140, 0.55);
  border-color: rgba(255, 255, 255, 0.7);
}
.tc-arrow { font-size: 30px; line-height: 1; }

/* Restart is the one genuinely costly mispress — it throws away the whole
   run — so it lives in the top-right corner, out of the arc a thumb sweeps
   while playing, and stays small so it never reads as a primary action. */
.tc-restart {
  position: fixed;
  top: max(10px, env(safe-area-inset-top));
  right: max(10px, env(safe-area-inset-right));
  width: 46px;
  height: 46px;
  font-size: 13px;
  opacity: 0.55;
}

/* Landscape phones are short; shrink rather than let the controls eat the
   play area, but keep the gaps proportionally wide. */
@media (max-height: 430px) {
  .tc-cluster { gap: 20px; }
  .tc-btn { width: 66px; height: 66px; font-size: 13px; }
  .tc-btn.tc-wide { width: 92px; }
  .tc-arrow { font-size: 24px; }
}
`;

type ButtonSpec = {
  label: string;
  classes?: string;
  /** Held buttons drive a boolean for as long as they're pressed; tap
   * buttons queue a single edge on press. */
  hold?: "left" | "right";
  tap?: "throwQueued" | "rushQueued" | "restartQueued";
};

function makeButton(spec: ButtonSpec): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = `tc-btn ${spec.classes ?? ""}`.trim();
  btn.innerHTML = spec.label;
  btn.setAttribute("aria-label", btn.textContent ?? "");

  const press = (e: PointerEvent) => {
    // Without this the browser may follow up with synthetic mouse events and
    // a 300ms double-tap-zoom on some mobile browsers.
    e.preventDefault();
    if (spec.hold) state[spec.hold] = true;
    if (spec.tap) state[spec.tap] = true;
    btn.classList.add("tc-held");
    // Keeps receiving events even if the finger slides off the button, so a
    // held direction doesn't silently stick on when the thumb drifts.
    btn.setPointerCapture(e.pointerId);
  };
  const release = (e: PointerEvent) => {
    e.preventDefault();
    if (spec.hold) state[spec.hold] = false;
    btn.classList.remove("tc-held");
    if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
  };

  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  // A long-press on a button would otherwise open the context menu mid-fight.
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  return btn;
}

/** Mounts the overlay if this looks like a touch device. Safe to call on
 * desktop — it simply does nothing. */
export function mountTouchControls(): void {
  if (!shouldShowControls()) return;
  if (document.querySelector(".tc-root")) return;

  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.className = "tc-root";

  const left = document.createElement("div");
  left.className = "tc-cluster";
  left.append(
    makeButton({ label: '<span class="tc-arrow">&#9664;</span>', hold: "left" }),
    makeButton({ label: '<span class="tc-arrow">&#9654;</span>', hold: "right" }),
  );

  const right = document.createElement("div");
  right.className = "tc-cluster";
  right.append(
    makeButton({ label: "RUSH", classes: "tc-wide", tap: "rushQueued" }),
    makeButton({ label: "THROW", classes: "tc-wide", tap: "throwQueued" }),
  );

  // Positioned by .tc-restart (top-right), deliberately away from both thumb
  // clusters — see the comment on that rule.
  const restart = makeButton({ label: "R", classes: "tc-restart", tap: "restartQueued" });

  root.append(left, right, restart);
  document.body.appendChild(root);
}

/** Hides the overlay without unmounting it. The art inspector uses this: on
 * a phone the thumb clusters sit exactly where the figure being inspected
 * is drawn, and there is nothing to drive while the simulation is frozen. */
export function setTouchControlsVisible(visible: boolean): void {
  const root = document.querySelector<HTMLElement>(".tc-root");
  if (root) root.style.display = visible ? "flex" : "none";
  if (!visible) touchInput.reset();
}
