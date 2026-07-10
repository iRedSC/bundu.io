import { describe, expect, test, beforeEach } from "bun:test";
import { OccupancyGrid } from "../../../packages/server/src/engine/occupancy";
import type { TilePos } from "@bundu/shared/tiles";

describe("OccupancyGrid", () => {
  let grid: OccupancyGrid;

  beforeEach(() => {
    grid = new OccupancyGrid();
  });

  test("fresh grid get returns undefined for any tile", () => {
    expect(grid.get(0, 0)).toBeUndefined();
    expect(grid.get(5, 9)).toBeUndefined();
    expect(grid.get(-1, -2)).toBeUndefined();
  });

  test("canPlace([]) is true on a fresh grid", () => {
    expect(grid.canPlace([])).toBe(true);
  });

  test("canPlace is true for free tiles", () => {
    const tiles: TilePos[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    expect(grid.canPlace(tiles)).toBe(true);
  });

  test("occupy success claims tiles for entityId", () => {
    const tiles: TilePos[] = [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ];
    expect(grid.occupy(1, tiles)).toBe(true);
    expect(grid.get(2, 3)).toBe(1);
    expect(grid.get(3, 3)).toBe(1);
  });

  test("after occupy, canPlace those tiles is false", () => {
    const tiles: TilePos[] = [{ x: 4, y: 5 }];
    grid.occupy(1, tiles);
    expect(grid.canPlace(tiles)).toBe(false);
    expect(grid.canPlace([{ x: 4, y: 5 }, { x: 0, y: 0 }])).toBe(false);
  });

  test("occupy fails when overlapping another entity", () => {
    grid.occupy(1, [{ x: 0, y: 0 }]);
    expect(grid.occupy(2, [{ x: 0, y: 0 }])).toBe(false);
    expect(grid.occupy(2, [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(false);
  });

  test("failed occupy leaves grid unchanged for the failed claim", () => {
    grid.occupy(1, [{ x: 0, y: 0 }]);
    expect(grid.occupy(2, [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(false);
    expect(grid.get(0, 0)).toBe(1);
    expect(grid.get(1, 0)).toBeUndefined();
    expect(grid.canPlace([{ x: 1, y: 0 }])).toBe(true);
  });

  test("occupy same entity again releases old tiles then claims new set", () => {
    expect(grid.occupy(1, [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(true);
    expect(grid.occupy(1, [{ x: 5, y: 5 }])).toBe(true);

    expect(grid.get(0, 0)).toBeUndefined();
    expect(grid.get(1, 0)).toBeUndefined();
    expect(grid.get(5, 5)).toBe(1);
    expect(grid.canPlace([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(true);
    expect(grid.canPlace([{ x: 5, y: 5 }])).toBe(false);
  });

  test("release frees previously claimed tiles", () => {
    const tiles: TilePos[] = [{ x: 2, y: 2 }, { x: 3, y: 2 }];
    grid.occupy(1, tiles);
    grid.release(1);
    expect(grid.get(2, 2)).toBeUndefined();
    expect(grid.get(3, 2)).toBeUndefined();
    expect(grid.canPlace(tiles)).toBe(true);
  });

  test("release unknown id is a safe no-op", () => {
    expect(() => grid.release(999)).not.toThrow();
    expect(grid.get(0, 0)).toBeUndefined();
    expect(grid.canPlace([{ x: 0, y: 0 }])).toBe(true);
  });

  test("two entities cannot share a tile", () => {
    expect(grid.occupy(1, [{ x: 7, y: 7 }])).toBe(true);
    expect(grid.occupy(2, [{ x: 7, y: 7 }])).toBe(false);
    expect(grid.get(7, 7)).toBe(1);
  });

  test("canPlace remains true for tiles not overlapping occupied ones", () => {
    grid.occupy(1, [{ x: 0, y: 0 }]);
    expect(grid.canPlace([{ x: 1, y: 1 }])).toBe(true);
  });
});
