import { describe, expect, test } from "bun:test";
import type { TilePos } from "@bundu/shared/tiles";
import {
  adjacentRoofIds,
  haloConnectsStumps,
  splitComponentsAfterDelete,
  stumpTiles,
  type RoofTileIndex,
} from "../../../packages/server/src/systems/roof_connectivity";

function indexFrom(
  roofs: Record<number, readonly TilePos[]>,
): RoofTileIndex {
  const at = new Map<string, number>();
  for (const [id, cells] of Object.entries(roofs)) {
    const entityId = Number(id);
    for (const { x, y } of cells) {
      at.set(`${x},${y}`, entityId);
    }
  }
  return {
    roofAt: (x, y) => at.get(`${x},${y}`),
    footprint: (entityId) => roofs[entityId] ?? [],
  };
}

describe("adjacentRoofIds", () => {
  test("finds ortho neighbors and ignores self / diagonals", () => {
    const index = indexFrom({
      1: [{ x: 0, y: 0 }],
      2: [{ x: 1, y: 0 }],
      3: [{ x: 1, y: 1 }],
    });
    expect(adjacentRoofIds(index, [{ x: 0, y: 0 }], 1).sort()).toEqual([2]);
  });
});

describe("stumpTiles", () => {
  test("returns distinct same-group neighbor tiles", () => {
    const index = indexFrom({
      1: [{ x: 1, y: 0 }],
      2: [{ x: 0, y: 0 }],
      3: [{ x: 2, y: 0 }],
      4: [{ x: 1, y: 1 }],
    });
    const members = new Set([2, 3, 4]);
    const stumps = stumpTiles(index, [{ x: 1, y: 0 }], members, 1);
    expect(stumps).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 1 },
      ]),
    );
    expect(stumps).toHaveLength(3);
  });
});

describe("delete connectivity ladder", () => {
  test("leaf delete (one stump) needs no split", () => {
    const index = indexFrom({
      1: [{ x: 0, y: 0 }],
      2: [{ x: 1, y: 0 }],
    });
    const members = new Set([1]);
    const stumps = stumpTiles(index, [{ x: 1, y: 0 }], members, 2);
    expect(stumps).toHaveLength(1);
    expect(
      splitComponentsAfterDelete(index, members, stumps),
    ).toBeUndefined();
  });

  test("halo reconnects a thick blob around a hole", () => {
    // 3x3 ring minus center; delete center-equivalent bridge tile at (1,0) edge? 
    // Use a 2x2 square of roofs; delete one corner — two stumps that meet at the diagonal
    // aren't 4-adjacent, but the third roof reconnects them inside the halo.
    const index = indexFrom({
      1: [{ x: 0, y: 0 }],
      2: [{ x: 1, y: 0 }],
      3: [{ x: 0, y: 1 }],
      4: [{ x: 1, y: 1 }],
    });
    const members = new Set([2, 3, 4]);
    const deleted: TilePos[] = [{ x: 0, y: 0 }];
    const stumps = stumpTiles(index, deleted, members, 1);
    expect(stumps.length).toBeGreaterThan(1);
    expect(haloConnectsStumps(index, deleted, members, stumps)).toBe(true);
    expect(
      splitComponentsAfterDelete(index, members, stumps),
    ).toBeUndefined();
  });

  test("corridor break splits into two components", () => {
    // 1-2-3 in a line; delete 2.
    const index = indexFrom({
      1: [{ x: 0, y: 0 }],
      2: [{ x: 1, y: 0 }],
      3: [{ x: 2, y: 0 }],
    });
    const members = new Set([1, 3]);
    const deleted: TilePos[] = [{ x: 1, y: 0 }];
    const stumps = stumpTiles(index, deleted, members, 2);
    expect(stumps).toHaveLength(2);
    expect(haloConnectsStumps(index, deleted, members, stumps)).toBe(false);
    const parts = splitComponentsAfterDelete(index, members, stumps);
    expect(parts).toBeDefined();
    if (!parts) return;
    expect(parts.length).toBe(2);
    const sorted = parts
      .map((part) => [...part].sort((a, b) => a - b))
      .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
    expect(sorted).toEqual([[1], [3]]);
  });
});
