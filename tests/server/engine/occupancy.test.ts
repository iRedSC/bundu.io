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

    expect(grid.occupy(1, footprint, "structure")).toBe(true);
    expect(grid.get(2, 3, "structure")).toBe(1);
    expect(grid.get(3, 3, "structure")).toBe(1);
    expect(grid.canPlace([{ x: 2, y: 3 }], "structure")).toBe(false);
    expect(grid.occupy(2, [{ x: 3, y: 3 }], "structure")).toBe(false);
    expect(grid.get(3, 3, "structure")).toBe(1);
  });

  test("a failed multi-tile claim is atomic", () => {
    grid.occupy(1, [{ x: 0, y: 0 }], "structure");

    expect(
      grid.occupy(
        2,
        [
          { x: 1, y: 0 },
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
        "structure",
      ),
    ).toBe(false);

    expect(grid.get(0, 0, "structure")).toBe(1);
    expect(grid.get(1, 0, "structure")).toBeUndefined();
    expect(grid.get(2, 0, "structure")).toBeUndefined();
  });

  test("moving an entity replaces its old footprint", () => {
    grid.occupy(
      1,
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      "structure",
    );

    expect(grid.occupy(1, [{ x: 5, y: 5 }], "structure")).toBe(true);

    expect(grid.get(0, 0, "structure")).toBeUndefined();
    expect(grid.get(1, 0, "structure")).toBeUndefined();
    expect(grid.get(5, 5, "structure")).toBe(1);
  });

  test("a failed move preserves the entity's previous footprint", () => {
    grid.occupy(1, [{ x: 0, y: 0 }], "structure");
    grid.occupy(2, [{ x: 5, y: 5 }], "structure");

    expect(grid.occupy(1, [{ x: 5, y: 5 }], "structure")).toBe(false);

    expect(grid.get(0, 0, "structure")).toBe(1);
    expect(grid.get(5, 5, "structure")).toBe(2);
  });

  test("release frees the entity's complete footprint", () => {
    const footprint = [
      { x: -2, y: 4 },
      { x: -1, y: 4 },
    ];
    grid.occupy(7, footprint, "structure");

    grid.release(7);

    expect(grid.canPlace(footprint, "structure")).toBe(true);
    expect(grid.get(-2, 4, "structure")).toBeUndefined();
    expect(grid.get(-1, 4, "structure")).toBeUndefined();
  });

  test("different layers can share a tile", () => {
    expect(grid.occupy(1, [{ x: 4, y: 4 }], "floor")).toBe(true);
    expect(grid.occupy(2, [{ x: 4, y: 4 }], "structure")).toBe(true);
    expect(grid.occupy(3, [{ x: 4, y: 4 }], "roof")).toBe(true);

    expect(grid.get(4, 4, "floor")).toBe(1);
    expect(grid.get(4, 4, "structure")).toBe(2);
    expect(grid.get(4, 4, "roof")).toBe(3);
    expect(grid.top(4, 4)).toBe(3);
    expect(grid.occupants(4, 4)).toEqual([3, 2, 1]);
  });

  test("releasing one layer leaves the others", () => {
    grid.occupy(1, [{ x: 0, y: 0 }], "floor");
    grid.occupy(2, [{ x: 0, y: 0 }], "structure");
    grid.release(2);

    expect(grid.get(0, 0, "floor")).toBe(1);
    expect(grid.get(0, 0, "structure")).toBeUndefined();
    expect(grid.top(0, 0)).toBe(1);
  });
});
