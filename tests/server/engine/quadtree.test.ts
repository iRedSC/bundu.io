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
    objects.set(1, { x: 10, y: 10 });
    objects.set(2, { x: 50, y: 50 });
    objects.set(3, { x: 90, y: 90 });

    tree.insert(1, objects.get(1)!);
    tree.insert(2, objects.get(2)!);
    tree.insert(3, objects.get(3)!);

    expect(tree.query([{ x: 0, y: 0 }, { x: 60, y: 60 }]).sort()).toEqual([1, 2]);
    expect(tree.query([{ x: 50, y: 50 }, { x: 50, y: 50 }])).toEqual([2]);
    expect(tree.get(2)).toEqual({ x: 50, y: 50 });
  });

  test("query bounds are inclusive on the edges", () => {
    objects.set(1, { x: 0, y: 0 });
    objects.set(2, { x: 100, y: 100 });
    tree.insert(1, objects.get(1)!);
    tree.insert(2, objects.get(2)!);

    expect(tree.query([{ x: 0, y: 0 }, { x: 0, y: 0 }])).toEqual([1]);
    expect(tree.query([{ x: 100, y: 100 }, { x: 100, y: 100 }])).toEqual([2]);
  });

  test("delete removes an id from subsequent queries", () => {
    objects.set(1, { x: 20, y: 20 });
    objects.set(2, { x: 30, y: 30 });
    tree.insert(1, objects.get(1)!);
    tree.insert(2, objects.get(2)!);

    tree.delete(1);

    expect(tree.query([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toEqual([2]);
    expect(tree.get(1)).toBeUndefined();
  });

  test("clear empties the spatial index but leaves the objects map intact", () => {
    objects.set(1, { x: 5, y: 5 });
    objects.set(2, { x: 15, y: 15 });
    tree.insert(1, objects.get(1)!);
    tree.insert(2, objects.get(2)!);

    tree.clear();

    expect(objects.size).toBe(2);
    expect(tree.query([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toEqual([]);

    tree.rebuild();
    expect(tree.query([{ x: 0, y: 0 }, { x: 100, y: 100 }]).sort()).toEqual([1, 2]);
  });

  test("re-inserting an id moves it for later queries", () => {
    objects.set(1, { x: 10, y: 10 });
    tree.insert(1, objects.get(1)!);

    objects.set(1, { x: 80, y: 80 });
    tree.insert(1, objects.get(1)!);

    expect(tree.query([{ x: 0, y: 0 }, { x: 20, y: 20 }])).toEqual([]);
    expect(tree.query([{ x: 70, y: 70 }, { x: 90, y: 90 }])).toEqual([1]);
    expect(tree.get(1)).toEqual({ x: 80, y: 80 });
  });
});
