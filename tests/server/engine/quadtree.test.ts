import { beforeEach, describe, expect, test } from "bun:test";
import { Quadtree } from "@bundu/server/engine/quadtree";

type BasicPoint = { x: number; y: number };

const WORLD: [BasicPoint, BasicPoint] = [
  { x: 0, y: 0 },
  { x: 100, y: 100 },
];

function sorted(ids: number[]): number[] {
  return [...ids].sort((a, b) => a - b);
}

describe("Quadtree", () => {
  let objectList: Map<number, BasicPoint>;
  let tree: Quadtree;

  beforeEach(() => {
    objectList = new Map();
    tree = new Quadtree(objectList, WORLD);
  });

  test("starts with an empty spatial index while sharing the provided objectList", () => {
    expect(sorted(tree.query(WORLD))).toEqual([]);
    expect(objectList.size).toBe(0);
    tree.insert(1, { x: 10, y: 10 });
    expect(objectList.get(1)).toEqual({ x: 10, y: 10 });
  });

  test("insert stores the position in objectList and makes in-bounds ids queryable", () => {
    const pos = { x: 25, y: 40 };
    tree.insert(7, pos);

    expect(objectList.get(7)).toBe(pos);
    expect(sorted(tree.query(WORLD))).toEqual([7]);
    expect(sorted(tree.query([{ x: 20, y: 30 }, { x: 30, y: 50 }]))).toEqual([
      7,
    ]);
  });

  test("insert of an out-of-bounds position keeps the id in objectList but not in queries", () => {
    tree.insert(3, { x: 200, y: 200 });

    expect(tree.get(3)).toEqual({ x: 200, y: 200 });
    expect(objectList.has(3)).toBe(true);
    expect(sorted(tree.query(WORLD))).toEqual([]);
  });

  test("re-inserting the same id moves it from the old position to the new one", () => {
    tree.insert(1, { x: 10, y: 10 });
    tree.insert(1, { x: 80, y: 80 });

    expect(tree.get(1)).toEqual({ x: 80, y: 80 });
    expect(sorted(tree.query([{ x: 0, y: 0 }, { x: 20, y: 20 }]))).toEqual([]);
    expect(sorted(tree.query([{ x: 70, y: 70 }, { x: 90, y: 90 }]))).toEqual([
      1,
    ]);
  });

  test("mutating a position object in place then re-inserting updates query results", () => {
    const pos = { x: 15, y: 15 };
    tree.insert(5, pos);
    pos.x = 90;
    pos.y = 90;
    tree.insert(5, pos);

    expect(sorted(tree.query([{ x: 10, y: 10 }, { x: 20, y: 20 }]))).toEqual(
      [],
    );
    expect(sorted(tree.query([{ x: 85, y: 85 }, { x: 95, y: 95 }]))).toEqual([
      5,
    ]);
  });

  test("query returns only ids whose positions fall inside the range", () => {
    tree.insert(1, { x: 10, y: 10 });
    tree.insert(2, { x: 50, y: 50 });
    tree.insert(3, { x: 90, y: 90 });

    expect(
      sorted(tree.query([{ x: 40, y: 40 }, { x: 60, y: 60 }])),
    ).toEqual([2]);
    expect(sorted(tree.query(WORLD))).toEqual([1, 2, 3]);
  });

  test("query of an empty tree or empty-result range returns an empty array", () => {
    expect(tree.query(WORLD)).toEqual([]);
    tree.insert(1, { x: 50, y: 50 });
    expect(tree.query([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });

  test("a point-equality range returns the id at that exact position", () => {
    const p = { x: 33, y: 44 };
    tree.insert(9, p);
    expect(sorted(tree.query([p, p]))).toEqual([9]);
  });

  test("delete removes an id from objectList and from subsequent queries", () => {
    tree.insert(1, { x: 10, y: 10 });
    tree.insert(2, { x: 20, y: 20 });
    tree.delete(1);

    expect(tree.get(1)).toBeUndefined();
    expect(objectList.has(1)).toBe(false);
    expect(sorted(tree.query(WORLD))).toEqual([2]);
  });

  test("deleting a missing id is a no-op", () => {
    tree.insert(1, { x: 10, y: 10 });
    tree.delete(99);

    expect(sorted(tree.query(WORLD))).toEqual([1]);
    expect(tree.get(1)).toEqual({ x: 10, y: 10 });
  });

  test("get returns the current position or undefined for missing and undefined ids", () => {
    tree.insert(4, { x: 12, y: 34 });

    expect(tree.get(4)).toEqual({ x: 12, y: 34 });
    expect(tree.get(99)).toBeUndefined();
    expect(tree.get(undefined)).toBeUndefined();
  });

  test("values yields the positions currently in objectList", () => {
    tree.insert(1, { x: 1, y: 1 });
    tree.insert(2, { x: 2, y: 2 });

    const fromValues = [...tree.values()].map((p) => ({ x: p.x, y: p.y }));
    const fromMap = [...objectList.values()].map((p) => ({ x: p.x, y: p.y }));

    expect(fromValues).toEqual(fromMap);
    expect(fromValues).toHaveLength(2);
  });

  test("clear empties the spatial index without changing objectList", () => {
    tree.insert(1, { x: 10, y: 10 });
    tree.insert(2, { x: 20, y: 20 });
    tree.clear();

    expect(objectList.size).toBe(2);
    expect(objectList.has(1)).toBe(true);
    expect(objectList.has(2)).toBe(true);
    expect(tree.query(WORLD)).toEqual([]);
  });

  test("rebuild after clear makes in-bounds objectList entries queryable again", () => {
    tree.insert(1, { x: 10, y: 10 });
    tree.insert(2, { x: 200, y: 200 });
    tree.clear();
    tree.rebuild();

    expect(sorted(tree.query(WORLD))).toEqual([1]);
    expect(tree.get(2)).toEqual({ x: 200, y: 200 });
  });

  test("rebuild reflects external objectList edits", () => {
    tree.insert(1, { x: 10, y: 10 });
    objectList.set(2, { x: 50, y: 50 });
    objectList.set(3, { x: -10, y: -10 });
    tree.rebuild();

    expect(sorted(tree.query(WORLD))).toEqual([1, 2]);
  });

  test("resizeBounds changes which positions are queryable without changing objectList", () => {
    tree.insert(1, { x: 10, y: 10 });
    tree.insert(2, { x: 80, y: 80 });

    const small: [BasicPoint, BasicPoint] = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ];
    tree.resizeBounds(small);

    expect(objectList.size).toBe(2);
    expect(sorted(tree.query(small))).toEqual([1]);
    expect(sorted(tree.query([{ x: 70, y: 70 }, { x: 90, y: 90 }]))).toEqual(
      [],
    );
  });

  test("resizeBounds to a larger area makes previously out-of-world positions queryable", () => {
    tree.insert(1, { x: 150, y: 150 });
    expect(tree.query(WORLD)).toEqual([]);

    const large: [BasicPoint, BasicPoint] = [
      { x: 0, y: 0 },
      { x: 200, y: 200 },
    ];
    tree.resizeBounds(large);

    expect(sorted(tree.query(large))).toEqual([1]);
  });

  test("with a small maxObjects, a full-bounds query still returns every in-bounds id", () => {
    const crowded = new Quadtree(objectList, WORLD, 1, 8);
    for (let i = 0; i < 20; i++) {
      crowded.insert(i, { x: (i % 5) * 20 + 5, y: Math.floor(i / 5) * 20 + 5 });
    }

    expect(sorted(crowded.query(WORLD))).toEqual(
      Array.from({ length: 20 }, (_, i) => i),
    );
  });

  test("with a small maxDepth, many objects at the same point are all returned", () => {
    const shallow = new Quadtree(objectList, WORLD, 2, 1);
    const p = { x: 50, y: 50 };
    for (let i = 0; i < 30; i++) {
      shallow.insert(i, { x: p.x, y: p.y });
    }

    expect(sorted(shallow.query([{ x: 50, y: 50 }, { x: 50, y: 50 }]))).toEqual(
      Array.from({ length: 30 }, (_, i) => i),
    );
  });

  test("after inserting many points and deleting all but one, only that id remains in queries", () => {
    const crowded = new Quadtree(objectList, WORLD, 1, 8);
    for (let i = 0; i < 25; i++) {
      crowded.insert(i, { x: (i % 5) * 18 + 3, y: Math.floor(i / 5) * 18 + 3 });
    }
    for (let i = 0; i < 25; i++) {
      if (i !== 11) crowded.delete(i);
    }

    expect(sorted(crowded.query(WORLD))).toEqual([11]);
    expect(objectList.size).toBe(1);
  });

  test("positions on world min and max corners are insertable and queryable", () => {
    tree.insert(1, { x: 0, y: 0 });
    tree.insert(2, { x: 100, y: 100 });

    expect(sorted(tree.query(WORLD))).toEqual([1, 2]);
    expect(sorted(tree.query([{ x: 0, y: 0 }, { x: 0, y: 0 }]))).toEqual([1]);
    expect(
      sorted(tree.query([{ x: 100, y: 100 }, { x: 100, y: 100 }])),
    ).toEqual([2]);
  });

  test("query ranges are inclusive on the edge that contains a coordinate", () => {
    tree.insert(1, { x: 50, y: 50 });

    expect(sorted(tree.query([{ x: 0, y: 0 }, { x: 49.999, y: 100 }]))).toEqual(
      [],
    );
    expect(sorted(tree.query([{ x: 0, y: 0 }, { x: 50, y: 100 }]))).toEqual([
      1,
    ]);
    expect(sorted(tree.query([{ x: 50, y: 50 }, { x: 100, y: 100 }]))).toEqual([
      1,
    ]);
    expect(
      sorted(tree.query([{ x: 50.001, y: 50 }, { x: 100, y: 100 }])),
    ).toEqual([]);
  });
});
