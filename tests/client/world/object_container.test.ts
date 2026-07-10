import { describe, expect, test, beforeEach } from "bun:test";
import ObjectContainer from "../../../packages/client/src/world/object_container";
import type GameObject from "../../../packages/client/src/world/game_object";

function stub(
  id: number,
  update: (now: number) => boolean = () => false,
): GameObject {
  return { id, update } as GameObject;
}

describe("ObjectContainer", () => {
  let container: ObjectContainer;

  beforeEach(() => {
    container = new ObjectContainer();
  });

  test("add/get/delete lifecycle", () => {
    const a = stub(1);
    const b = stub(2);

    container.add(a);
    container.add(b);

    expect(container.get(1)).toBe(a);
    expect(container.get(2)).toBe(b);
    expect([...container.all()]).toEqual([a, b]);

    container.delete(1);
    expect(container.get(1)).toBeUndefined();
    expect([...container.all()]).toEqual([b]);

    container.delete(b);
    expect(container.get(2)).toBeUndefined();
    expect([...container.all()]).toEqual([]);

    expect(() => container.delete(99)).not.toThrow();
  });

  test("update removes completed objects from updating set only", () => {
    let done = false;
    const active = stub(1, () => done);
    const idle = stub(2, () => false);

    container.add(active);
    container.add(idle);

    container.update(1000);
    expect(container.updating.has(active)).toBe(true);
    expect(container.updating.has(idle)).toBe(true);
    expect(container.get(1)).toBe(active);

    done = true;
    container.update(2000);

    expect(container.updating.has(active)).toBe(false);
    expect(container.updating.has(idle)).toBe(true);
    expect(container.get(1)).toBe(active);
    expect(container.get(2)).toBe(idle);
    expect([...container.all()]).toEqual([active, idle]);
  });
});
