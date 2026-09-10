import Phaser from "phaser";
import { TESTS, TestCase, Check } from "./tests";
import type { GameScene } from "../scenes/GameScene";

export interface RunResult {
  name: string;
  pass: boolean;
  checks: Check[];
}

function step(game: Phaser.Game, clock: { value: number }, n: number): void {
  for (let i = 0; i < n; i++) {
    clock.value += 16;
    game.loop.step(clock.value);
  }
}

/** Drives the given tests against the real, live GameScene — same demo
 * setup, same update() loop, no mocking. Steps the engine manually (rather
 * than waiting on requestAnimationFrame) so this works even when the tab
 * isn't focused/visible. Leaves the scene on whatever the final test set
 * up; call again (or click Reset) to get a clean slate. */
export function runTests(game: Phaser.Game, sceneKey: string, tests: readonly TestCase[]): RunResult[] {
  const results: RunResult[] = [];
  const clock = { value: performance.now() };

  for (const test of tests) {
    let scene = game.scene.getScene(sceneKey) as unknown as GameScene;
    scene.runDemo(test.demo);
    step(game, clock, 5); // settle the restart -> create() -> applyDemo() cycle

    scene = game.scene.getScene(sceneKey) as unknown as GameScene;
    if (test.run) test.run(scene);

    const checks: Check[] = [];
    for (const cp of test.checkpoints) {
      step(game, clock, Math.max(1, Math.round(cp.afterMs / 16)));
      scene = game.scene.getScene(sceneKey) as unknown as GameScene;
      checks.push(...cp.assert(scene));
    }
    results.push({ name: test.name, pass: checks.every((c) => c.pass), checks });
  }

  return results;
}

export function runAllTests(game: Phaser.Game, sceneKey: string): RunResult[] {
  return runTests(game, sceneKey, TESTS);
}
