import { describe, expect, test } from "bun:test";
import {
  PositionStates,
  RotationStates,
} from "../../../../packages/client/src/world/states";

describe("PositionStates", () => {
  test("set invokes callback and interpolate progresses toward target", () => {
    let calls = 0;
    const states = new PositionStates(() => {
      calls += 1;
    });

    const t0 = 0;
    states.set({ x: 100, y: 200 });
    expect(calls).toBe(1);

    const first = states.interpolate(t0);
    const mid = states.interpolate(t0 + 50);
    const later = states.interpolate(t0 + 200);

    const dist = (p: { x: number; y: number }) =>
      Math.hypot(100 - p.x, 200 - p.y);

    // Over advancing time, position should move closer to (or reach) the target
    expect(dist(mid)).toBeLessThanOrEqual(dist(first) + 1e-6);
    expect(dist(later)).toBeLessThanOrEqual(dist(mid) + 1e-6);

    // Eventually settle
    let settled = false;
    for (let t = t0; t < t0 + 5_000; t += 100) {
      states.interpolate(t);
      if (states.isComplete()) {
        settled = true;
        break;
      }
    }
    expect(settled).toBe(true);
    const final = states.interpolate();
    expect(final.x).toBeCloseTo(100, 0);
    expect(final.y).toBeCloseTo(200, 0);
  });
});

describe("RotationStates", () => {
  test("set invokes callback and isComplete after enough time", async () => {
    let calls = 0;
    const states = new RotationStates(() => {
      calls += 1;
    });

    states.set(Math.PI / 2);
    expect(calls).toBe(1);

    const value = states.interpolate();
    expect(typeof value).toBe("number");
    expect(Number.isFinite(value)).toBe(true);

    // Coarse: wait until interpolation finishes (wall-clock based)
    const deadline = Date.now() + 3_000;
    while (!states.isComplete() && Date.now() < deadline) {
      states.interpolate();
      await Bun.sleep(20);
    }
    expect(states.isComplete()).toBe(true);
  });
});
