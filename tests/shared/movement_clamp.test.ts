import { describe, expect, test } from "bun:test";
import { encodeMoveDirection } from "@bundu/shared";

describe("encodeMoveDirection", () => {
  test("packs every in-range axis pair into the movement wire whitelist", () => {
    expect(encodeMoveDirection(0, 0)).toBe(1);
    expect(encodeMoveDirection(0, 1)).toBe(2);
    expect(encodeMoveDirection(0, 2)).toBe(3);
    expect(encodeMoveDirection(1, 0)).toBe(5);
    expect(encodeMoveDirection(1, 1)).toBe(6);
    expect(encodeMoveDirection(1, 2)).toBe(7);
    expect(encodeMoveDirection(2, 0)).toBe(9);
    expect(encodeMoveDirection(2, 1)).toBe(10);
    expect(encodeMoveDirection(2, 2)).toBe(11);
  });

  test("clamps out-of-range axes before packing", () => {
    expect(encodeMoveDirection(-5, 1)).toBe(2); // x→0, y→1
    expect(encodeMoveDirection(9, 1)).toBe(10); // x→2, y→1
    expect(encodeMoveDirection(1, -3)).toBe(5); // x→1, y→0
    expect(encodeMoveDirection(1, 8)).toBe(7); // x→1, y→2
    expect(encodeMoveDirection(-100, 100)).toBe(3); // x→0, y→2
    expect(encodeMoveDirection(0.4, 1.9)).toBe(6); // x→1, y→1
  });
});
