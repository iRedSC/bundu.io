import { describe, expect, mock, test } from "bun:test";
import {
  PositionStates,
  RotationStates,
} from "../../../packages/client/src/world/states";

describe("PositionStates", () => {
  test("snaps the first state and interpolates later states over the configured interval", () => {
    const changed = mock(() => {});
    const states = new PositionStates(changed, 100);

    states.set({ x: 10, y: 20 }, 1_000);
    states.set({ x: 30, y: 60 }, 1_000);

    expect(states.interpolate(1_050)).toEqual({ x: 20, y: 40 });
    expect(states.interpolate(1_100)).toEqual({ x: 30, y: 60 });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  test("retargets from the rendered position without snapping backward", () => {
    const states = new PositionStates(undefined, 100);
    states.snap({ x: 0, y: 0 }, 0);
    states.set({ x: 100, y: 0 }, 0);
    expect(states.interpolate(150)).toEqual({ x: 150, y: 0 });

    states.set({ x: 200, y: 0 }, 150);

    expect(states.interpolate(150)).toEqual({ x: 150, y: 0 });
    expect(states.interpolate(200)).toEqual({ x: 175, y: 0 });
  });

  test("caps late-packet extrapolation and reports completion", () => {
    const states = new PositionStates(undefined, 100);
    states.snap({ x: 0, y: 0 }, 0);
    states.set({ x: 100, y: 0 }, 0);

    const settled = states.interpolate(10_000);

    expect(settled).toEqual({ x: 160, y: 0 });
    expect(states.interpolate(20_000)).toEqual(settled);
    expect(states.isComplete(160)).toBe(true);
  });
});

describe("RotationStates", () => {
  test("interpolates toward the target and completes at one server tick", () => {
    const changed = mock(() => {});
    const states = new RotationStates(changed);
    states.snap(0, 1_000);
    states.set(Math.PI / 2, 1_000);

    const midway = states.interpolate(1_025);

    expect(midway).toBeCloseTo(Math.PI / 4);
    expect(states.isComplete(1_025)).toBe(false);
    expect(states.interpolate(1_050)).toBeCloseTo(Math.PI / 2);
    expect(states.isComplete(1_050)).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  test("takes the shortest path across the angle wrap boundary", () => {
    const states = new RotationStates();
    const degrees = (value: number) => (value * 180) / Math.PI;
    states.snap((350 * Math.PI) / 180, 0);
    states.set((10 * Math.PI) / 180, 0);

    expect(degrees(states.interpolate(25))).toBeCloseTo(360);
    expect(degrees(states.interpolate(50)) % 360).toBeCloseTo(10);
  });
});
