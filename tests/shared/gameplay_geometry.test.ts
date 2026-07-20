import { describe, expect, test } from "bun:test";
import {
  Range,
  attackBoxPoints,
  attackFacingRadians,
  axesFromPressedKeys,
  decodeMoveDirection,
  encodeMoveDirection,
  footprintCenter,
  structureOriginAtPoint,
  type MoveAxis,
  type MoveVectorComponent,
} from "@bundu/shared";

describe("movement wire directions", () => {
  test("round-trips every valid pair of client axes", () => {
    const axes: MoveAxis[] = [0, 1, 2];
    const decoded = {
      0: -1,
      1: 0,
      2: 1,
    } as const satisfies Record<MoveAxis, MoveVectorComponent>;

    for (const x of axes) {
      for (const y of axes) {
        expect(decodeMoveDirection(encodeMoveDirection(x, y))).toEqual([
          decoded[x],
          decoded[y],
        ]);
      }
    }
  });

  test("maps pressed keys to axes and cancels opposing inputs", () => {
    // Server applies position -= moveDir, so left encodes as +x (axis 2).
    expect(
      axesFromPressedKeys({ up: true, down: false, left: true, right: false }),
    ).toEqual([2, 2]);
    expect(
      axesFromPressedKeys({ up: false, down: true, left: false, right: true }),
    ).toEqual([0, 0]);
    expect(
      axesFromPressedKeys({ up: true, down: true, left: true, right: true }),
    ).toEqual([1, 1]);
    expect(
      axesFromPressedKeys({
        up: false,
        down: false,
        left: false,
        right: false,
      }),
    ).toEqual([1, 1]);
  });
});

describe("attack geometry", () => {
  test("builds a forward-facing rectangle around its near-edge origin", () => {
    expect(attackBoxPoints({ x: 10, y: 20 }, 0, 6, 4)).toEqual([
      { x: 10, y: 18 },
      { x: 16, y: 18 },
      { x: 16, y: 22 },
      { x: 10, y: 22 },
    ]);
  });

  test("rotates the attack box with mathematical facing", () => {
    const points = attackBoxPoints({ x: 0, y: 0 }, Math.PI / 2, 4, 2);
    expect(points).toHaveLength(4);

    const xs = points.map((point) => point.x).sort((a, b) => a - b);
    const ys = points.map((point) => point.y).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1);
    expect(xs[3]).toBeCloseTo(1);
    expect(ys[0]).toBeCloseTo(0);
    expect(ys[3]).toBeCloseTo(4);
  });

  test("converts sprite-up rotation to mathematical facing", () => {
    expect(attackFacingRadians(0)).toBe(Math.PI / 2);
    expect(attackFacingRadians(-Math.PI / 2)).toBe(0);
  });
});

describe("structure placement geometry", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];

  test("centers rotated footprints and places that center on the cursor tile", () => {
    expect(footprintCenter(square, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(footprintCenter(square, 1)).toEqual({ x: -0.5, y: 0.5 });
    expect(footprintCenter([], 0)).toEqual({ x: 0, y: 0 });
    expect(structureOriginAtPoint({ x: 10, y: 20 }, square, 1)).toEqual({
      x: 11,
      y: 20,
    });
  });

  test("centers irregular footprints by bounds rather than cell density", () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ];

    expect(footprintCenter(lShape, 0)).toEqual({ x: 0.5, y: 1 });
    expect(structureOriginAtPoint({ x: 10, y: 20 }, lShape, 0)).toEqual({
      x: 10,
      y: 19,
    });
  });
});

describe("Range", () => {
  test("normalizes negative dimensions and includes boundary points", () => {
    const range = new Range({ x: 10, y: 10 }, -4, -6);

    expect(range.normalized).toEqual([
      { x: 6, y: 4 },
      { x: 10, y: 10 },
    ]);
    expect(range.contains({ x: 6, y: 4 })).toBe(true);
    expect(range.contains({ x: 5.99, y: 4 })).toBe(false);
  });

  test("builds from two corners and reports dimensions", () => {
    const range = new Range({ x: 2, y: 5 }, { x: 8, y: 1 });

    expect(range.dimensions).toEqual([6, 4]);
    expect(range.contains({ x: 2, y: 1 })).toBe(true);
    expect(range.contains({ x: 8, y: 5 })).toBe(true);
  });

  test("treats touching edges as intersection but rejects separated ranges", () => {
    const range = new Range({ x: 0, y: 0 }, 10, 10);

    expect(range.intersects(new Range({ x: 10, y: 4 }, 5, 2))).toBe(true);
    expect(range.intersects(new Range({ x: 10.01, y: 4 }, 5, 2))).toBe(false);
  });
});
