import Phaser from "phaser";

/** The one home for every debug panel: a tabbed drawer docked under the game.
 *
 * It exists because the panels used to be `position: fixed` overlays, and an
 * overlay on a phone lands on top of the only thing worth looking at. The
 * drawer is a **sibling of the canvas**, not a layer over it: the page becomes
 * a flex column, the canvas takes the space that's left, and Phaser re-fits
 * into it. Opening a tab therefore shrinks the picture rather than covering
 * it, and the figure being inspected stays whole.
 *
 * (Phaser's FIT mode only rescales the finished 960x540 render target, so
 * nothing about the game's own geometry — the camera zoom the art inspector
 * solves, the pinned HUD — changes when the drawer opens. It just arrives on
 * screen smaller.)
 *
 * Tabs rather than several panels open at once: on the screen this is for,
 * one panel is already most of the height, and two would leave nothing.
 */
export interface DebugDock {
  /** Registers a tab and returns the element to fill with its content. */
  addTab(key: string, label: string, opts?: { attention?: boolean }): HTMLElement;
  /** Brings a tab to the front, opening the drawer if it was collapsed. */
  activate(key: string): void;
}

const STORE_KEY = "ze-dock";

export function mountDebugDock(game: Phaser.Game): DebugDock {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  // The page is laid out as "game above, drawer below" rather than the
  // drawer floating over the game. index.html centres #app in a row; this
  // turns it into a column with the canvas taking whatever the drawer leaves.
  document.body.style.flexDirection = "column";
  const app = document.getElementById("app");
  if (app) {
    app.style.flex = "1";
    // Without an explicit min-height a flex child refuses to shrink below its
    // content, and the canvas would push the drawer off the bottom.
    app.style.minHeight = "0";
    app.style.width = "100%";
  }

  const root = document.createElement("div");
  root.className = "dk-root";

  const tabs = document.createElement("div");
  tabs.className = "dk-tabs";

  const panes = document.createElement("div");
  panes.className = "dk-panes";

  root.append(tabs, panes);
  document.body.appendChild(root);

  const buttons = new Map<string, HTMLButtonElement>();
  const contents = new Map<string, HTMLElement>();
  let active: string | null = null;
  let collapsed = false;

  /** Phaser sizes the canvas against its parent's box, and only recomputes
   * that on a window resize — which changing the drawer's height is not.
   *
   * Called straight away rather than from a rAF: refresh() reads the parent's
   * box, which forces the style change above to be laid out first anyway, and
   * a background tab throttles rAF to nothing — which is exactly where this
   * was silently not running. The timeout is the belt-and-braces pass for a
   * browser that defers the reflow. */
  const refit = (): void => {
    game.scale.refresh();
    setTimeout(() => game.scale.refresh(), 0);
  };

  const save = (): void => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ active, collapsed }));
    } catch {
      // Private browsing — the drawer still works, it just isn't remembered.
    }
  };

  const render = (): void => {
    for (const [key, btn] of buttons) {
      btn.classList.toggle("dk-on", key === active && !collapsed);
    }
    for (const [key, el] of contents) {
      el.style.display = key === active && !collapsed ? "flex" : "none";
    }
    panes.style.display = collapsed ? "none" : "flex";
    chevron.textContent = collapsed ? "▴" : "▾";
    refit();
  };

  const chevron = document.createElement("button");
  chevron.className = "dk-chevron";
  chevron.addEventListener("click", () => {
    collapsed = !collapsed;
    chevron.blur();
    render();
    save();
  });

  function activate(key: string): void {
    if (!contents.has(key)) return;
    // Tapping the tab you're already on closes the drawer — the fastest way
    // back to an unobstructed view of the figure, which is the whole point.
    collapsed = key === active ? !collapsed : false;
    active = key;
    render();
    save();
  }

  function addTab(key: string, label: string, opts?: { attention?: boolean }): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "dk-tab";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      activate(key);
      btn.blur();
    });
    // The chevron stays last however many tabs get added.
    tabs.insertBefore(btn, chevron);
    buttons.set(key, btn);

    const pane = document.createElement("div");
    pane.className = "dk-pane";
    panes.appendChild(pane);
    contents.set(key, pane);

    if (active === null && !opts?.attention) active = key;
    render();
    return pane;
  }

  tabs.appendChild(chevron);

  // Restored after the tabs exist, so a remembered tab that no longer exists
  // simply falls back to the first one registered.
  queueMicrotask(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { active?: string; collapsed?: boolean };
        if (saved.active && contents.has(saved.active)) active = saved.active;
        collapsed = saved.collapsed ?? false;
      }
    } catch {
      // Unparseable or unavailable — the defaults are fine.
    }
    render();
  });

  window.addEventListener("resize", refit);

  return { addTab, activate };
}

/* Sized for a thumb: 16px on anything focusable (iOS zooms the page in below
   that and never zooms back out, which would crop the canvas for the rest of
   the session), and 38px+ on anything tappable. */
const CSS = `
.dk-root {
  flex: none;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 20, 0.96);
  border-top: 1px solid #555;
  font-family: monospace;
  color: #ddd;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  -webkit-user-select: none;
  user-select: none;
}
.dk-tabs {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid #333;
}
.dk-tab, .dk-chevron {
  background: #1a1a2e;
  color: #cfcfe6;
  border: 1px solid #555;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  min-height: 34px;
  padding: 0 12px;
  cursor: pointer;
  touch-action: manipulation;
}
.dk-tab.dk-on { background: #2b4a58; color: #6fe3ff; border-color: #6fe3ff; }
.dk-chevron { margin-left: auto; min-width: 44px; font-size: 14px; }
.dk-panes {
  display: flex;
  flex-direction: column;
  /* The drawer is capped so it can never take the whole screen; past that
     each pane scrolls inside it. */
  max-height: 46vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 8px 10px 10px;
}
.dk-pane {
  display: none;
  flex-direction: column;
  gap: 6px;
  /* Full width on a phone, but a button stretched across a desktop monitor
     is just a harder target to aim at. */
  width: 100%;
  max-width: 760px;
  align-self: center;
}

@media (min-width: 721px) {
  .dk-panes { max-height: 38vh; }
}
`;
