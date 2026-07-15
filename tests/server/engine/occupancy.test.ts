import { beforeEach, describe, expect, test } from "bun:test";
import type { TilePos } from "@bundu/shared/tiles";
import { OccupancyGrid } from "../../../packages/server/src/engine/occupancy";

describe("OccupancyGrid", () => {
  let grid: OccupancyGrid;

  beforeEach(() => {
    grid = new OccupancyGrid();
  });

  test("claims every tile for an entity and rejects overlapping claims", () => {
    const footprint: TilePos[] = [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ];

    expect(grid.occupy(1, footprint)).toBe(true);
    expect(grid.get(2, 3)).toBe(1);
    expect(grid.get(3, 3)).toBe(1);
    expect(grid.canPlace([{ x: 2, y: 3 }])).toBe(false);
    expect(grid.occupy(2, [{ x: 3, y: 3 }])).toBe(false);
    expect(grid.get(3, 3)).toBe(1);
  });

  test("a failed multi-tile claim is atomic", () => {
    grid.occupy(1, [{ x: 0, y: 0 }]);

    expect(
      grid.occupy(2, [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toBe(false);

    expect(grid.get(0, 0)).toBe(1);
    expect(grid.get(1, 0)).toBeUndefined();
    expect(grid.get(2, 0)).toBeUndefined();
  });

  test("moving an entity replaces its old footprint", () => {
    grid.occupy(1, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);

    expect(grid.occupy(1, [{ x: 5, y: 5 }])).toBe(true);

    expect(grid.get(0, 0)).toBeUndefined();
    expect(grid.get(1, 0)).toBeUndefined();
    expect(grid.get(5, 5)).toBe(1);
  });

  test("a failed move preserves the entity's previous footprint", () => {
    grid.occupy(1, [{ x: 0, y: 0 }]);
    grid.occupy(2, [{ x: 5, y: 5 }]);

    expect(grid.occupy(1, [{ x: 5, y: 5 }])).toBe(false);

    expect(grid.get(0, 0)).toBe(1);
    expect(grid.get(5, 5)).toBe(2);
  });

  test("release frees the entity's complete footprint", () => {
    const footprint = [
      { x: -2, y: 4 },
      { x: -1, y: 4 },
    ];
    grid.occupy(7, footprint);

    grid.release(7);

    expect(grid.canPlace(footprint)).toBe(true);
    expect(grid.get(-2, 4)).toBeUndefined();
    expect(grid.get(-1, 4)).toBeUndefined();
  });
});
