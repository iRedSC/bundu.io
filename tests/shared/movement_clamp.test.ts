import { describe, expect, test } from "bun:test";
import { encodeMoveDirection } from "@bundu/shared";

const VALID_DIRECTIONS = new Set([1, 2, 3, 5, 6, 7, 9, 10, 11]);

describe("encodeMoveDirection", () => {
  test("packs every in-range axis pair into the movement whitelist", () => {
    for (const x of [0, 1, 2] as const) {
      for (const y of [0, 1, 2] as const) {
        expect(VALID_DIRECTIONS.has(encodeMoveDirection(x, y))).toBe(true);
      }
    }
  });

  test("clamps out-of-range axes before packing so results stay whitelisted", () => {
    const samples: [number, number][] = [
      [-5, 1],
      [9, 1],
      [1, -3],
      [1, 8],
      [-100, 100],
      [0.4, 1.9],
    ];

    for (const [x, y] of samples) {
      expect(VALID_DIRECTIONS.has(encodeMoveDirection(x, y))).toBe(true);
    }
  });
});
