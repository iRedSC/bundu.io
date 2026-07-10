import { describe, expect, test, beforeEach } from "bun:test";
import ObjectContainer from "../../../../packages/client/src/world/object_container";

type StubObject = {
  id: number;
  update: (now: number) => boolean;
};

function stub(id: number, update: (now: number) => boolean = () => false): StubObject {
  return { id, update };
}

describe("ObjectContainer", () => {
  let container: ObjectContainer;

  beforeEach(() => {
    container = new ObjectContainer();
  });

  test("add/get/delete lifecycle", () => {
    const a = stub(1);
    const b = stub(2);

    container.add(a as never);
    container.add(b as never);

    expect(container.get(1)).toBe(a);
    expect(container.get(2)).toBe(b);
    expect(container.objects.size).toBe(2);
    expect(container.updating.has(a as never)).toBe(true);
    expect(container.updating.has(b as never)).toBe(true);
    expect([...container.all()]).toEqual([a, b] as never[]);

    container.delete(1);
    expect(container.get(1)).toBeUndefined();
    expect(container.updating.has(a as never)).toBe(false);
    expect(container.objects.size).toBe(1);

    container.delete(b as never);
    expect(container.get(2)).toBeUndefined();
    expect(container.objects.size).toBe(0);
    expect(container.updating.size).toBe(0);

    expect(() => container.delete(99)).not.toThrow();
  });

  test("update removes completed objects from updating set only", () => {
    let done = false;
    const active = stub(1, () => done);
    const idle = stub(2, () => false);

    container.add(active as never);
    container.add(idle as never);

    container.update(1000);
    expect(container.updating.has(active as never)).toBe(true);
    expect(container.updating.has(idle as never)).toBe(true);
    expect(container.get(1)).toBe(active);

    done = true;
    container.update(2000);

    expect(container.updating.has(active as never)).toBe(false);
    expect(container.updating.has(idle as never)).toBe(true);
    expect(container.get(1)).toBe(active);
    expect(container.get(2)).toBe(idle);
    expect(container.objects.size).toBe(2);
  });
});
