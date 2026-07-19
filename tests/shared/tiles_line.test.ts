import { describe, expect, test } from "bun:test";
import {
  deciToWorld,
  quantizeWorld,
  tilesOnLine,
  worldToDeci,
  type TilePos,
} from "@bundu/shared/tiles";

describe("tilesOnLine", () => {
  test("a single point yields exactly that tile", () => {
    expect(tilesOnLine({ x: 3, y: -2 }, { x: 3, y: -2 })).toEqual([
      { x: 3, y: -2 },
    ]);
  });

  test("includes both endpoints on axis-aligned and diagonal runs", () => {
    expect(tilesOnLine({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(tilesOnLine({ x: 2, y: 1 }, { x: 2, y: 4 })).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]);
    expect(tilesOnLine({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  test("is inclusive Bresenham for a shallow slope in both directions", () => {
    const forward: TilePos[] = tilesOnLine({ x: 0, y: 0 }, { x: 4, y: 2 });
    expect(forward).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 2 },
    ]);
    // Reverse direction is also inclusive but may visit different intermediate tiles.
    expect(tilesOnLine({ x: 4, y: 2 }, { x: 0, y: 0 })).toEqual([
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]);
  });
});

describe("deci / world quantization round-trip", () => {
  test("deciToWorld undoes worldToDeci under quantizeWorld", () => {
    for (const w of [0, 1, -1, 10.49, 10.5, -10.5, 42.51, 99.999, -100.001]) {
      expect(quantizeWorld(w)).toBe(deciToWorld(worldToDeci(w)));
    }
  });
});
