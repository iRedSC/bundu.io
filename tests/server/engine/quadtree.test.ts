import { beforeEach, describe, expect, test } from "bun:test";
import { Quadtree } from "@bundu/server/engine/quadtree";

type Point = { x: number; y: number };

describe("Quadtree", () => {
  let objects: Map<number, Point>;
  let tree: Quadtree;

  beforeEach(() => {
    objects = new Map<number, Point>();
    tree = new Quadtree(objects, [{ x: 0, y: 0 }, { x: 100, y: 100 }], 4);
  });

  test("insert then query returns only ids whose positions fall in range", () => {
    const a = { x: 10, y: 10 };
    const b = { x: 50, y: 50 };
    const c = { x: 90, y: 90 };
    objects.set(1, a);
    objects.set(2, b);
    objects.set(3, c);

    tree.insert(1, a);
    tree.insert(2, b);
    tree.insert(3, c);

    expect(tree.query([{ x: 0, y: 0 }, { x: 60, y: 60 }]).sort()).toEqual([
      1, 2,
    ]);
    expect(tree.query([{ x: 50, y: 50 }, { x: 50, y: 50 }])).toEqual([2]);
    expect(tree.get(2)).toEqual({ x: 50, y: 50 });
  });

  test("query bounds are inclusive on the edges and exclusive just outside", () => {
    const origin = { x: 0, y: 0 };
    const far = { x: 100, y: 100 };
    const mid = { x: 50, y: 50 };
    objects.set(1, origin);
    objects.set(2, far);
    objects.set(3, mid);
    tree.insert(1, origin);
    tree.insert(2, far);
    tree.insert(3, mid);

    expect(tree.query([{ x: 0, y: 0 }, { x: 0, y: 0 }])).toEqual([1]);
    expect(tree.query([{ x: 100, y: 100 }, { x: 100, y: 100 }])).toEqual([2]);
    expect(tree.query([{ x: 0.01, y: 0 }, { x: 99.99, y: 100 }])).toEqual([3]);
    expect(tree.query([{ x: -1, y: -1 }, { x: -0.01, y: -0.01 }])).toEqual([]);
  });

  test("delete removes an id from subsequent queries", () => {
    const a = { x: 20, y: 20 };
    const b = { x: 30, y: 30 };
    objects.set(1, a);
    objects.set(2, b);
    tree.insert(1, a);
    tree.insert(2, b);

    tree.delete(1);

    expect(tree.query([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toEqual([2]);
    expect(tree.get(1)).toBeUndefined();
    expect(objects.has(1)).toBe(false);
    expect(objects.has(2)).toBe(true);
  });

  test("clear empties the spatial index but leaves the objects map intact", () => {
    const a = { x: 5, y: 5 };
    const b = { x: 15, y: 15 };
    objects.set(1, a);
    objects.set(2, b);
    tree.insert(1, a);
    tree.insert(2, b);

    tree.clear();

    expect(objects.size).toBe(2);
    expect(objects.get(1)).toEqual({ x: 5, y: 5 });
    expect(objects.get(2)).toEqual({ x: 15, y: 15 });
    expect(tree.query([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toEqual([]);

    tree.rebuild();
    expect(tree.query([{ x: 0, y: 0 }, { x: 100, y: 100 }]).sort()).toEqual([
      1, 2,
    ]);
  });

  test("re-inserting an id moves it for later queries", () => {
    const start = { x: 10, y: 10 };
    const moved = { x: 80, y: 80 };
    objects.set(1, start);
    tree.insert(1, start);

    objects.set(1, moved);
    tree.insert(1, moved);

    expect(tree.query([{ x: 0, y: 0 }, { x: 20, y: 20 }])).toEqual([]);
    expect(tree.query([{ x: 70, y: 70 }, { x: 90, y: 90 }])).toEqual([1]);
    expect(tree.get(1)).toEqual({ x: 80, y: 80 });
  });
});
