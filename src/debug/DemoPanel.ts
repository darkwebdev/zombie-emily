import Phaser from "phaser";
import { DEMOS, DemoName } from "./demos";
import { runAllTests, RunResult } from "./TestRunner";
import { TESTS, Check } from "./tests";
import type { GameScene } from "../scenes/GameScene";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RunsDemos {
  runDemo(name: DemoName): void;
}

/** Vertical stack of buttons docked to the right edge of the page, plus an
 * info bar across the top showing the active scenario's name and what it's
 * meant to demonstrate. Each button pokes the live GameScene into a
 * specific state so a mechanic can be seen in isolation without manually
 * driving the game to reach it. Debug-only — only mounted when ?debug=1 is
 * present. */
export function mountDemoPanel(game: Phaser.Game, sceneKey: string): void {
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

  for (const demo of DEMOS) {
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
    ].join(";");
    btn.addEventListener("mouseenter", () => (btn.style.background = "#2a2a4a"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#1a1a2e"));
    btn.addEventListener("click", () => {
      runDemoWithTests(demo);
      // Un-focus immediately so Space (aggro) or arrow keys don't get
      // swallowed as a synthetic click on this button afterward.
      btn.blur();
    });
    panel.appendChild(btn);
  }

  document.body.appendChild(panel);
}
