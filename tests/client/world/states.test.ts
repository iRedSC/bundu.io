import { describe, expect, spyOn, test } from "bun:test";
import { SERVER_TICK_MS } from "@bundu/shared";
import { serverTime } from "@client/globals";
import {
  PositionStates,
  RotationStates,
} from "../../../packages/client/src/world/states";

/** Mirrors packages/client/src/world/states.ts */
const INTERP_MS = SERVER_TICK_MS * 1.05;
const EXTRAP = 0.6;

describe("PositionStates", () => {
  test("returns origin before any set", () => {
    const states = new PositionStates();
    expect(states.interpolate()).toEqual({ x: 0, y: 0 });
  });

  test("snaps first set then lerps visual toward latest over INTERP_MS", () => {
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

      states.set({ x: 100, y: 200 });
      expect(calls).toBe(2);
      const segmentStart = fakeNow;

      const mid = states.interpolate(segmentStart + INTERP_MS / 2);
      expect(mid.x).toBeCloseTo(50, 5);
      expect(mid.y).toBeCloseTo(100, 5);
      expect(states.isComplete()).toBe(false);

      fakeNow = segmentStart + INTERP_MS;
      const atTarget = states.interpolate(fakeNow);
      expect(atTarget.x).toBeCloseTo(100, 5);
      expect(atTarget.y).toBeCloseTo(200, 5);
      expect(states.isComplete()).toBe(false);

      fakeNow = segmentStart + INTERP_MS * (1 + EXTRAP);
      expect(states.isComplete()).toBe(true);
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
      // Mirror GameObject: snap initial rotation so network sets interpolate.
      states.snap(0);
      expect(calls).toBe(1);

      const target = Math.PI / 2;
      states.set(target);
      expect(calls).toBe(2);

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
