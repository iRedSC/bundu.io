import { describe, expect, test } from "bun:test";
import { clamp, rotationLerp } from "@bundu/shared";

describe("clamp", () => {
  test("null sides are unbounded; both null is identity", () => {
    expect(clamp(5, null, null)).toBe(5);
    expect(clamp(-100, null, 10)).toBe(-100);
    expect(clamp(100, 0, null)).toBe(100);
    // max-only: values above max are capped; below max pass through.
    expect(clamp(50, null, -10)).toBe(-10);
    expect(clamp(-50, null, -10)).toBe(-50);
    // min-only: values below min are raised; above min pass through.
    expect(clamp(-50, 10, null)).toBe(10);
    expect(clamp(50, 10, null)).toBe(50);
  });

  test("clamps to inclusive finite bounds", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(7, 0, 10)).toBe(7);
    expect(clamp(3, 3, 3)).toBe(3);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe("rotationLerp", () => {
  test("takes the shortest arc between angles (radians)", () => {
    expect(rotationLerp(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4, 5);
    expect(rotationLerp(0.2, Math.PI * 2 - 0.2, 0.5)).toBeCloseTo(0, 5);
    const reverse = rotationLerp(Math.PI * 2 - 0.2, 0.2, 0.5);
    expect(Math.cos(reverse)).toBeCloseTo(1, 5);
    expect(Math.sin(reverse)).toBeCloseTo(0, 5);
  });

  test("clamps t above 1 but may extrapolate for negative t", () => {
    expect(rotationLerp(0, Math.PI / 2, 0)).toBeCloseTo(0, 5);
    expect(rotationLerp(0, Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2, 5);
    expect(rotationLerp(0, Math.PI / 2, 2)).toBeCloseTo(Math.PI / 2, 5);
    expect(rotationLerp(0, Math.PI / 2, -1)).toBeCloseTo(-Math.PI / 2, 5);
    expect(rotationLerp(0, Math.PI / 2, -0.5)).toBeCloseTo(-Math.PI / 4, 5);
  });
});
