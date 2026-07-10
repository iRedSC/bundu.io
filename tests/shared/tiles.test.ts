import { describe, expect, test } from "bun:test";
import {
  TILE_SIZE,
  deciToWorld,
  pointToTile,
  quantizeWorld,
  rotateOffset,
  tileCenterWorld,
  tileKey,
  worldFootprint,
  worldToDeci,
  worldToTile,
  type TilePos,
} from "@bundu/shared/tiles";

describe("worldToDeci / deciToWorld", () => {
  test("round-trip for multiples of WORLD_PER_DECI", () => {
    for (const world of [0, 10, 20, 100, 250, -10, -100]) {
      expect(deciToWorld(worldToDeci(world))).toBe(world);
    }
  });

  test("worldToDeci converts exact decitile world positions", () => {
    expect(worldToDeci(0)).toBe(0);
    expect(worldToDeci(10)).toBe(1);
    expect(worldToDeci(100)).toBe(10);
  });

  test("deciToWorld converts integer decitiles to world units", () => {
    expect(deciToWorld(0)).toBe(0);
    expect(deciToWorld(1)).toBe(10);
    expect(deciToWorld(10)).toBe(100);
  });

  test("worldToDeci rounds to nearest", () => {
    expect(worldToDeci(4)).toBe(0);
    expect(worldToDeci(5)).toBe(1);
    expect(worldToDeci(14)).toBe(1);
    expect(worldToDeci(15)).toBe(2);
  });
});

describe("quantizeWorld", () => {
  test("snaps to decitile world positions", () => {
    expect(quantizeWorld(0)).toBe(0);
    expect(quantizeWorld(10)).toBe(10);
    expect(quantizeWorld(4)).toBe(0);
    expect(quantizeWorld(5)).toBe(10);
    expect(quantizeWorld(14)).toBe(10);
    expect(quantizeWorld(15)).toBe(20);
  });
});

describe("worldToTile", () => {
  test("uses floor for positive world coordinates", () => {
    expect(worldToTile(0)).toBe(0);
    expect(worldToTile(99)).toBe(0);
    expect(worldToTile(100)).toBe(1);
    expect(worldToTile(150)).toBe(1);
    expect(worldToTile(200)).toBe(2);
  });

  test("uses floor for negative world coordinates", () => {
    expect(worldToTile(-1)).toBe(-1);
    expect(worldToTile(-100)).toBe(-1);
    expect(worldToTile(-101)).toBe(-2);
  });
});

describe("tileCenterWorld", () => {
  test("is tile * TILE_SIZE + TILE_SIZE / 2", () => {
    expect(tileCenterWorld(0)).toBe(TILE_SIZE / 2);
    expect(tileCenterWorld(1)).toBe(TILE_SIZE + TILE_SIZE / 2);
    expect(tileCenterWorld(2)).toBe(2 * TILE_SIZE + TILE_SIZE / 2);
    expect(tileCenterWorld(-1)).toBe(-TILE_SIZE + TILE_SIZE / 2);
  });
});

describe("tileKey", () => {
  test("same cell yields same key", () => {
    expect(tileKey(3, 7)).toBe(tileKey(3, 7));
    expect(tileKey(0, 0)).toBe(tileKey(0, 0));
  });

  test("different cells yield different keys", () => {
    expect(tileKey(0, 0)).not.toBe(tileKey(1, 0));
    expect(tileKey(0, 0)).not.toBe(tileKey(0, 1));
    expect(tileKey(1, 2)).not.toBe(tileKey(2, 1));
    expect(tileKey(-1, 0)).not.toBe(tileKey(0, -1));
  });
});

describe("rotateOffset", () => {
  const offset = { x: 2, y: 1 };

  test("rot 0 leaves offset unchanged", () => {
    expect(rotateOffset(offset.x, offset.y, 0)).toEqual({ x: 2, y: 1 });
  });

  test("rot 1 is (x,y) → (-y, x)", () => {
    expect(rotateOffset(offset.x, offset.y, 1)).toEqual({ x: -1, y: 2 });
  });

  test("rot 2 is (x,y) → (-x, -y)", () => {
    expect(rotateOffset(offset.x, offset.y, 2)).toEqual({ x: -2, y: -1 });
  });

  test("rot 3 is (x,y) → (y, -x)", () => {
    expect(rotateOffset(offset.x, offset.y, 3)).toEqual({ x: 1, y: -2 });
  });

  test("rot 0 on origin stays origin", () => {
    expect(rotateOffset(0, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("worldFootprint", () => {
  const origin: TilePos = { x: 10, y: 20 };
  const blocked: readonly TilePos[] = [
    { x: 0, y: 0 },
    { x: 2, y: 1 },
  ];

  test("empty blocked returns empty array", () => {
    expect(worldFootprint(origin, [], 0)).toEqual([]);
  });

  test("rot 0 translates without rotating", () => {
    expect(worldFootprint(origin, blocked, 0)).toEqual([
      { x: 10, y: 20 },
      { x: 12, y: 21 },
    ]);
  });

  test("applies rotation then origin translation", () => {
    expect(worldFootprint(origin, blocked, 1)).toEqual([
      { x: 10, y: 20 },
      { x: 9, y: 22 },
    ]);
    expect(worldFootprint(origin, blocked, 2)).toEqual([
      { x: 10, y: 20 },
      { x: 8, y: 19 },
    ]);
    expect(worldFootprint(origin, blocked, 3)).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 18 },
    ]);
  });
});

describe("pointToTile", () => {
  test("floors each axis to containing tile", () => {
    expect(pointToTile({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(pointToTile({ x: 99, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(pointToTile({ x: 100, y: 200 })).toEqual({ x: 1, y: 2 });
    expect(pointToTile({ x: 150, y: 250 })).toEqual({ x: 1, y: 2 });
  });

  test("floors negative coordinates", () => {
    expect(pointToTile({ x: -1, y: -1 })).toEqual({ x: -1, y: -1 });
    expect(pointToTile({ x: -100, y: 50 })).toEqual({ x: -1, y: 0 });
  });
});
