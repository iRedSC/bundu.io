import { describe, expect, spyOn, test } from "bun:test";
import {
  PositionStates,
  RotationStates,
} from "../../../packages/client/src/world/states";

describe("PositionStates", () => {
  test("set invokes callback and interpolate progresses toward target", () => {
    let calls = 0;
    const states = new PositionStates(() => {
      calls += 1;
    });

    let fakeNow = 1_000;
    const nowSpy = spyOn(performance, "now").mockImplementation(() => fakeNow);

    try {
      // First set snaps current to the target; seed so the second set must lerp.
      states.set({ x: 0, y: 0 });
      expect(calls).toBe(1);

      const target = { x: 100, y: 200 };
      states.set(target);
      expect(calls).toBe(2);

      const dist = (p: { x: number; y: number }) =>
        Math.hypot(target.x - p.x, target.y - p.y);

      const first = states.interpolate(fakeNow);
      fakeNow += 50;
      const mid = states.interpolate(fakeNow);
      fakeNow += 150;
      const later = states.interpolate(fakeNow);

      expect(dist(first)).toBeGreaterThan(1);
      expect(dist(mid)).toBeLessThan(dist(first));
      expect(dist(later)).toBeLessThan(dist(mid));

      let settled = false;
      for (let i = 0; i < 50; i++) {
        fakeNow += 100;
        states.interpolate(fakeNow);
        if (states.isComplete()) {
          settled = true;
          break;
        }
      }
      expect(settled).toBe(true);
      const final = states.interpolate(fakeNow);
      expect(final.x).toBeCloseTo(target.x, 0);
      expect(final.y).toBeCloseTo(target.y, 0);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("RotationStates", () => {
  test("set invokes callback and interpolate progresses toward target", () => {
    let calls = 0;
    const states = new RotationStates(() => {
      calls += 1;
    });

    let fakeNow = 1_000;
    const nowSpy = spyOn(performance, "now").mockImplementation(() => fakeNow);

    try {
      const target = Math.PI / 2;
      states.set(target);
      expect(calls).toBe(1);

      const first = states.interpolate();
      fakeNow += 25;
      const mid = states.interpolate();
      fakeNow += 25;
      const later = states.interpolate();

      // From last=0 toward π/2: values should advance and land on target.
      expect(mid).toBeGreaterThan(first);
      expect(later).toBeGreaterThan(mid);
      expect(later).toBeCloseTo(target, 5);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
