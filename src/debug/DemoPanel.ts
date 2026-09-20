import Phaser from "phaser";
import { DEMOS, DEMO_GROUPS, DemoName, UNGROUPED_DEMO } from "./demos";
import { runAllTests, RunResult } from "./TestRunner";
import { TESTS, Check } from "./tests";
import type { GameScene } from "../scenes/GameScene";
import { hitboxesEnabled, setHitboxes } from "./hitboxes";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RunsDemos {
  runDemo(name: DemoName): void;
}

/** The panel's selection is mirrored into the query string so any scenario
 * can be linked to, bookmarked, or pasted into a bug report and land the
 * reader on exactly that scenario, already running.
 *
 * replaceState rather than pushState: clicking through ten demos while
 * hunting a bug would otherwise stack ten history entries, and Back would
 * walk them one at a time instead of leaving the page. */
const URL_DEMO = "demo";
const URL_TESTS = "tests";

function writeSelectionToUrl(key: typeof URL_DEMO | typeof URL_TESTS, value: string): void {
  const url = new URL(location.href);
  // Only ever one selection at a time — a URL carrying both a demo and a
  // full test run would be ambiguous about which one to restore.
  url.searchParams.delete(URL_DEMO);
  url.searchParams.delete(URL_TESTS);
  url.searchParams.set(key, value);
  history.replaceState(null, "", url);
}

/** Resolves once the scene is actually running, so a deep link can drive it.
 * The panel is mounted synchronously right after `new Phaser.Game()` (see
 * main.ts), which is well before Phaser has booted and registered scenes.
 *
 * Two details that both matter:
 * - It waits for `isActive()`, not merely for the scene object to exist. The
 *   object is registered at boot, but both restore paths immediately call
 *   `runDemo()` -> `scene.restart()`, which needs `create()` to have run.
 * - It polls on setTimeout rather than requestAnimationFrame, which browsers
 *   throttle to a standstill in a background tab — otherwise a link opened
 *   in a background tab would sit here forever instead of restoring once the
 *   tab is eventually looked at. */
function whenSceneReady(game: Phaser.Game, sceneKey: string): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + 10_000;
    const check = (): void => {
      const scene = game.scene.getScene(sceneKey);
      if (scene?.sys.isActive()) resolve(true);
      else if (Date.now() > deadline) resolve(false);
      else setTimeout(check, 16);
    };
    check();
  });
}

/** Vertical stack of buttons docked to the right edge of the page, plus an
 * info bar across the top showing the active scenario's name and what it's
 * meant to demonstrate. Each button pokes the live GameScene into a
 * specific state so a mechanic can be seen in isolation without manually
 * driving the game to reach it. Debug-only — only mounted when ?debug=1 is
 * present. */
export function mountDemoPanel(game: Phaser.Game, sceneKey: string): void {
  // Debug-only handle for driving the running game from a devtools console or
  // a CDP script. The project verifies behaviour in a live browser rather than
  // only through tsc, and without this there's no way to read the scene from
  // outside — Phaser keeps no global registry of game instances.
  (window as unknown as { __game?: Phaser.Game }).__game = game;
  const info = document.createElement("div");
  info.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "padding:8px 12px",
    "background:rgba(10,10,20,0.85)",
    "color:#fff",
    "font-family:monospace",
    "z-index:1001",
    "border-bottom:1px solid #555",
  ].join(";");

  const infoName = document.createElement("div");
  infoName.style.cssText = "font-size:13px;font-weight:bold;color:#6fe3ff;";
  infoName.textContent = "No demo running";

  const infoDesc = document.createElement("div");
  infoDesc.style.cssText = "font-size:11px;color:#ccc;margin-top:2px;";
  infoDesc.textContent = "Pick a scenario from the panel on the right.";

  info.appendChild(infoName);
  info.appendChild(infoDesc);
  document.body.appendChild(info);

  const panel = document.createElement("div");
  panel.style.cssText = [
    "position:fixed",
    "top:64px",
    "right:16px",
    "display:flex",
    "flex-direction:column",
    "gap:6px",
    "z-index:1000",
    "font-family:monospace",
    // The tree is taller than the viewport once a couple of branches are
    // open, so the panel scrolls rather than running off the bottom.
    "max-height:calc(100vh - 80px)",
    "overflow-y:auto",
    "width:190px",
  ].join(";");

  const results = document.createElement("div");
  results.style.cssText = [
    "position:fixed",
    "top:64px",
    "left:16px",
    "width:340px",
    "max-height:80vh",
    "overflow-y:auto",
    "display:flex",
    "flex-direction:column",
    "gap:4px",
    "z-index:1000",
    "font-family:monospace",
    "font-size:11px",
    "background:rgba(10,10,20,0.85)",
    "padding:10px",
    "border-radius:4px",
    "border:1px solid #555",
  ].join(";");
  results.hidden = true;
  document.body.appendChild(results);

  function appendCheckRow(c: Check, indent: boolean): void {
    const checkRow = document.createElement("div");
    checkRow.style.cssText = `color:${c.pass ? "#8fd98f" : "#e38f8f"};${indent ? "padding-left:14px;" : ""}font-size:10px;`;
    // The detail (actual value) only earns its keep on a failure — on a
    // pass the label alone already says what was expected and confirmed.
    checkRow.textContent = `${c.pass ? "✓" : "✗"} ${c.label}${!c.pass && c.detail ? ` (${c.detail})` : ""}`;
    results.appendChild(checkRow);
  }

  /** Renders pass/fail rows for a finished (or in-progress) test run. A
   * single test collapses straight to its own checks — no redundant
   * "1/1 passed" summary or test-name row wrapping a single thing. */
  function renderRunResults(title: string, runResults: RunResult[]): void {
    console.table(runResults);
    results.hidden = false;
    results.innerHTML = "";

    const header = document.createElement("div");
    header.style.cssText = "font-weight:bold;color:#6fe3ff;margin-bottom:4px;";
    header.textContent = title;
    results.appendChild(header);

    if (runResults.length === 1) {
      for (const c of runResults[0].checks) appendCheckRow(c, false);
      return;
    }

    const passCount = runResults.filter((r) => r.pass).length;
    const summary = document.createElement("div");
    summary.style.cssText = `font-weight:bold;color:${passCount === runResults.length ? "#6fe36f" : "#e36f6f"};margin-bottom:4px;`;
    summary.textContent = `${passCount}/${runResults.length} passed`;
    results.appendChild(summary);

    for (const r of runResults) {
      const row = document.createElement("div");
      row.style.cssText = `color:${r.pass ? "#8fd98f" : "#e38f8f"};font-weight:bold;`;
      row.textContent = `${r.pass ? "✓" : "✗"} ${r.name}`;
      results.appendChild(row);

      // Every fact this test actually checked, so it's visible what "pass"
      // means for this scenario rather than just a single opaque verdict.
      for (const c of r.checks) appendCheckRow(c, true);
    }
  }

  // Bumped on every demo click so a stale in-flight watch (from a demo the
  // user already clicked away from) knows to stop updating the panel
  // instead of overwriting it with results for a scenario no longer on
  // screen.
  let runToken = 0;

  /** Applies a demo and, if it has a matching test, watches it resolve in
   * real time on the SAME live scene the user is looking at — no separate
   * fast-forwarded simulation running invisibly behind the display. Every
   * check this scenario will ever run is listed up front as pending; each
   * one only ever flips its own icon in place once its real-time window
   * elapses and it's actually true on screen — the list itself never
   * grows or reorders mid-run. */
  async function runDemoWithTests(demo: (typeof DEMOS)[number]): Promise<void> {
    const token = ++runToken;
    infoName.textContent = demo.label;
    infoDesc.textContent = demo.description;

    const scene = game.scene.getScene(sceneKey) as unknown as RunsDemos;
    scene.runDemo(demo.name);

    const demoTests = TESTS.filter((t) => t.demo === demo.name);
    results.hidden = false;
    results.innerHTML = "";
    const header = document.createElement("div");
    header.style.cssText = "font-weight:bold;color:#6fe3ff;margin-bottom:4px;";
    header.textContent = `Tests for: ${demo.label}`;
    results.appendChild(header);

    if (demoTests.length === 0) {
      const none = document.createElement("div");
      none.style.cssText = "color:#999;";
      none.textContent = "No test covers this scenario yet.";
      results.appendChild(none);
      return;
    }

    await nextFrame(); // let the queued restart's create()/applyDemo() actually run
    if (token !== runToken) return;

    let liveScene = game.scene.getScene(sceneKey) as unknown as GameScene;

    // Labels don't depend on scene state (only pass/detail do), so a single
    // early read of every checkpoint's checks is enough to lay out the
    // full, final row list right away — each row starts pending and is
    // updated in place once its own checkpoint's real time elapses.
    const single = demoTests.length === 1;
    const rowsPerTestPerCheckpoint = demoTests.map((t) => {
      // With two tests on one demo, the checks alone read as one long list
      // of unrelated facts — name the scenario each group belongs to, the
      // same way the batch run does.
      if (!single) {
        const nameRow = document.createElement("div");
        nameRow.style.cssText = "color:#bbb;font-weight:bold;margin-top:4px;";
        nameRow.textContent = t.name;
        results.appendChild(nameRow);
      }
      return t.checkpoints.map((cp) =>
        cp.assert(liveScene).map((c) => {
          const row = document.createElement("div");
          row.style.cssText = `color:#999;${single ? "" : "padding-left:14px;"}font-size:10px;`;
          row.textContent = `… ${c.label}`;
          results.appendChild(row);
          return row;
        }),
      );
    });

    for (let ti = 0; ti < demoTests.length; ti++) {
      const t = demoTests[ti];
      // Where a demo carries more than one test, each gets the scenario
      // replayed from a clean start — the same thing the batch runner does.
      // Two tests on one scene would otherwise contaminate each other: a
      // second test's run() (a limb thrown at the very soldier the first
      // one is still watching recover, say) would already be in flight.
      if (ti > 0) {
        (game.scene.getScene(sceneKey) as unknown as RunsDemos).runDemo(demo.name);
        await nextFrame();
        if (token !== runToken) return;
        liveScene = game.scene.getScene(sceneKey) as unknown as GameScene;
      }
      if (t.run) t.run(liveScene);
      for (let ci = 0; ci < t.checkpoints.length; ci++) {
        const cp = t.checkpoints[ci];
        await wait(cp.afterMs);
        if (token !== runToken) return;
        liveScene = game.scene.getScene(sceneKey) as unknown as GameScene;
        const checks = cp.assert(liveScene);
        const rows = rowsPerTestPerCheckpoint[ti][ci];
        checks.forEach((c, i) => {
          const row = rows[i];
          if (!row) return;
          row.style.color = c.pass ? "#8fd98f" : "#e38f8f";
          row.textContent = `${c.pass ? "✓" : "✗"} ${c.label}${!c.pass && c.detail ? ` (${c.detail})` : ""}`;
        });
      }
    }
  }

  // Arcade Physics' body outlines, off by default — see debug/hitboxes.ts.
  const hitboxBtn = document.createElement("button");
  const hitboxStyle = (on: boolean): void => {
    hitboxBtn.textContent = `${on ? "\u2611" : "\u2610"} Hitboxes`;
    hitboxBtn.style.background = on ? "#1a2a4a" : "#222";
    hitboxBtn.style.borderColor = on ? "#4a7aca" : "#555";
  };
  hitboxBtn.style.cssText = [
    "padding:6px 10px",
    "color:#fff",
    "border:1px solid #555",
    "border-radius:4px",
    "cursor:pointer",
    "font-size:12px",
    "font-family:monospace",
    "text-align:left",
  ].join(";");
  hitboxStyle(hitboxesEnabled());
  hitboxBtn.addEventListener("click", () => {
    const scene = game.scene.getScene(sceneKey);
    setHitboxes(scene, !hitboxesEnabled());
    hitboxStyle(hitboxesEnabled());
    hitboxBtn.blur();
  });
  panel.appendChild(hitboxBtn);

  const testBtn = document.createElement("button");
  testBtn.textContent = "▶ Run All Tests";
  testBtn.style.cssText = [
    "padding:6px 10px",
    "background:#1a3a1a",
    "color:#fff",
    "border:1px solid #4a8a4a",
    "border-radius:4px",
    "cursor:pointer",
    "font-size:12px",
    "font-family:monospace",
    "text-align:left",
    "font-weight:bold",
  ].join(";");
  testBtn.addEventListener("mouseenter", () => (testBtn.style.background = "#2a5a2a"));
  testBtn.addEventListener("mouseleave", () => (testBtn.style.background = "#1a3a1a"));
  testBtn.addEventListener("click", () => {
    writeSelectionToUrl(URL_TESTS, "all");
    const runResults = runAllTests(game, sceneKey);
    renderRunResults("All tests", runResults);

    // The test run leaves the scene on whatever the last test set up —
    // put the info bar back in a sane state reflecting that.
    const lastDemo = DEMOS.find((d) => d.name === "reset")!;
    infoName.textContent = "Tests finished";
    infoDesc.textContent = `Scene left on the last test's scenario. Click ${lastDemo.label} for a clean slate.`;
    testBtn.blur();
  });
  panel.appendChild(testBtn);

  /** Every demo button, whatever branch it lives in — built once here so the
   * styling and the click behaviour can't drift between the standalone
   * "Reset" button and the ones inside the tree. */
  const demoButton = (demo: (typeof DEMOS)[number], indented: boolean): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.textContent = demo.label;
    btn.style.cssText = [
      "padding:6px 10px",
      "background:#1a1a2e",
      "color:#fff",
      "border:1px solid #555",
      "border-radius:4px",
      "cursor:pointer",
      "font-size:12px",
      "font-family:monospace",
      "text-align:left",
      indented ? "margin-left:12px" : "",
    ].join(";");
    btn.addEventListener("mouseenter", () => (btn.style.background = "#2a2a4a"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#1a1a2e"));
    btn.addEventListener("click", () => {
      writeSelectionToUrl(URL_DEMO, demo.name);
      runDemoWithTests(demo);
      // Un-focus immediately so Space (aggro) or arrow keys don't get
      // swallowed as a synthetic click on this button afterward.
      btn.blur();
    });
    return btn;
  };

  panel.appendChild(demoButton(DEMOS.find((d) => d.name === UNGROUPED_DEMO)!, false));

  // How to reveal a given demo's branch, so a deep-linked scenario isn't
  // left running inside a collapsed group with nothing on screen explaining
  // where it came from.
  const revealByDemo = new Map<DemoName, () => void>();

  // One collapsible branch per group. Expansion state lives in the DOM and
  // the panel is mounted once per page load, so a branch stays open across
  // the scene.restart() that running a demo triggers.
  for (const group of DEMO_GROUPS) {
    const children = document.createElement("div");
    children.style.cssText = ["display:none", "flex-direction:column", "gap:6px"].join(";");

    const header = document.createElement("button");
    const setOpen = (open: boolean): void => {
      children.style.display = open ? "flex" : "none";
      header.textContent = `${open ? "▾" : "▸"} ${group.label}`;
    };
    header.style.cssText = [
      "padding:6px 10px",
      "background:#141422",
      "color:#cfcfe6",
      "border:1px solid #444",
      "border-radius:4px",
      "cursor:pointer",
      "font-size:12px",
      "font-family:monospace",
      "text-align:left",
      "font-weight:bold",
    ].join(";");
    setOpen(false);
    header.addEventListener("mouseenter", () => (header.style.background = "#222238"));
    header.addEventListener("mouseleave", () => (header.style.background = "#141422"));
    header.addEventListener("click", () => {
      setOpen(children.style.display === "none");
      header.blur();
    });

    for (const name of group.demos) {
      children.appendChild(demoButton(DEMOS.find((d) => d.name === name)!, true));
      revealByDemo.set(name, () => setOpen(true));
    }
    panel.appendChild(header);
    panel.appendChild(children);
  }

  document.body.appendChild(panel);

  // Restore whatever the URL asks for. This is the other half of
  // writeSelectionToUrl: clicking a button puts the scenario in the URL, and
  // opening that URL puts the scenario back on screen, already running.
  void (async () => {
    const params = new URLSearchParams(location.search);
    const demoParam = params.get(URL_DEMO);
    const testsParam = params.get(URL_TESTS);
    if (!demoParam && !testsParam) return;

    if (!(await whenSceneReady(game, sceneKey))) {
      infoName.textContent = "Could not restore from URL";
      infoDesc.textContent = "The scene never became active — pick a scenario from the panel instead.";
      return;
    }

    if (testsParam === "all") {
      const runResults = runAllTests(game, sceneKey);
      renderRunResults("All tests", runResults);
      infoName.textContent = "Tests finished";
      infoDesc.textContent = "Restored from the URL. Scene left on the last test's scenario.";
      return;
    }

    const demo = DEMOS.find((d) => d.name === demoParam);
    if (!demo) {
      // Silently doing nothing here would look identical to a broken panel,
      // so say which name failed and what the valid ones are.
      infoName.textContent = `Unknown demo: ${demoParam}`;
      infoDesc.textContent = `Not one of: ${DEMOS.map((d) => d.name).join(", ")}`;
      return;
    }
    revealByDemo.get(demo.name)?.();
    void runDemoWithTests(demo);
  })();
}
