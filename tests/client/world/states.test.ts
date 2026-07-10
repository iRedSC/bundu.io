import { describe, expect, spyOn, test } from "bun:test";
import { serverTime } from "@client/globals";
import {
  PositionStates,
  RotationStates,
} from "../../../packages/client/src/world/states";

describe("PositionStates", () => {
  test("returns origin before any set", () => {
    const states = new PositionStates();
    expect(states.interpolate()).toEqual({ x: 0, y: 0 });
  });

  test("set invokes callback, snaps first target, then smooths toward later targets", () => {
    let calls = 0;
    const states = new PositionStates(() => {
      calls += 1;
    });

    let fakeNow = 1_000;
    const nowSpy = spyOn(serverTime, "now").mockImplementation(() => fakeNow);

    try {
      states.set({ x: 0, y: 0 });
      expect(calls).toBe(1);
      expect(states.interpolate(fakeNow)).toEqual({ x: 0, y: 0 });

      const target = { x: 100, y: 200 };
      states.set(target);
      expect(calls).toBe(2);

      const dist = (p: { x: number; y: number }) =>
        Math.hypot(target.x - p.x, target.y - p.y);

      // Elapsed ≈ 0: still near the prior position, not snapped to the new target.
      const first = states.interpolate(fakeNow);
      expect(dist(first)).toBeGreaterThan(1);

      fakeNow += 50;
      const mid = states.interpolate(fakeNow);
      fakeNow += 150;
      const later = states.interpolate(fakeNow);

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
  test("set invokes callback and interpolate progresses toward target until complete", () => {
    let calls = 0;
    const states = new RotationStates(() => {
      calls += 1;
    });

    let fakeNow = 1_000;
    const nowSpy = spyOn(serverTime, "now").mockImplementation(() => fakeNow);

    try {
      const target = Math.PI / 2;
      states.set(target);
      expect(calls).toBe(1);

      const first = states.interpolate();
      expect(Math.abs(target - first)).toBeGreaterThan(0.01);
      expect(states.isComplete()).toBe(false);

      fakeNow += 25;
      const mid = states.interpolate();
      fakeNow += 25;
      const later = states.interpolate();

      expect(Math.abs(target - mid)).toBeLessThan(Math.abs(target - first));
      expect(Math.abs(target - later)).toBeLessThan(Math.abs(target - mid));

      let settled = false;
      for (let i = 0; i < 50; i++) {
        fakeNow += 100;
        states.interpolate();
        if (states.isComplete()) {
          settled = true;
          break;
        }
      }
      expect(settled).toBe(true);
      expect(states.interpolate()).toBeCloseTo(target, 5);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
