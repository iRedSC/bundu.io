import { describe, expect, test } from "bun:test";
import {
  pointToTile,
  quantizeWorld,
  rotateOffset,
  tileCenterWorld,
  tileKey,
  worldFootprint,
  worldToDeci,
  worldToTile,
  type TilePos,
  type TileRot,
} from "@bundu/shared/tiles";

describe("world coordinate helpers", () => {
  test("quantizes to the nearest authoritative position", () => {
    expect(worldToDeci(10.49)).toBe(10);
    expect(worldToDeci(10.5)).toBe(11);
    expect(worldToDeci(-10.5)).toBe(-10);
    expect(quantizeWorld(42.51)).toBe(43);
  });

  test("maps boundary positions to their containing tile", () => {
    expect(worldToTile(99.999)).toBe(0);
    expect(worldToTile(100)).toBe(1);
    expect(worldToTile(-0.001)).toBe(-1);
    expect(worldToTile(-100)).toBe(-1);
    expect(worldToTile(-100.001)).toBe(-2);

    expect(pointToTile({ x: 250, y: -101 })).toEqual({ x: 2, y: -2 });
  });

  test("returns the world-space center for positive and negative tiles", () => {
    expect(tileCenterWorld(3)).toBe(350);
    expect(tileCenterWorld(-2)).toBe(-150);
  });

  test("produces distinct keys for representative playable cells", () => {
    const cells: TilePos[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 199, y: 199 },
    ];

    expect(new Set(cells.map(({ x, y }) => tileKey(x, y))).size).toBe(
      cells.length,
    );
  });
});

describe("tile footprints", () => {
  test("rotates a non-symmetric offset counter-clockwise", () => {
    const expected: Record<TileRot, TilePos> = {
      0: { x: 2, y: 1 },
      1: { x: -1, y: 2 },
      2: { x: -2, y: -1 },
      3: { x: 1, y: -2 },
    };

    for (const rot of [0, 1, 2, 3] as const) {
      expect(rotateOffset(2, 1, rot)).toEqual(expected[rot]);
    }
  });

  test("rotates local cells before translating them into world tiles", () => {
    const origin = { x: 10, y: 20 };
    const blocked = [
      { x: 0, y: 0 },
      { x: 2, y: 1 },
    ];

    expect(worldFootprint(origin, blocked, 1)).toEqual([
      { x: 10, y: 20 },
      { x: 9, y: 22 },
    ]);
    expect(worldFootprint(origin, blocked, 3)).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 18 },
    ]);
  });

  test("does not mutate consumer-owned origin or footprint data", () => {
    const origin = { x: 4, y: 7 };
    const blocked = [{ x: 1, y: 2 }];

    worldFootprint(origin, blocked, 2);

    expect(origin).toEqual({ x: 4, y: 7 });
    expect(blocked).toEqual([{ x: 1, y: 2 }]);
  });
});
