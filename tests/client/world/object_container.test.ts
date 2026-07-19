import { beforeEach, describe, expect, mock, test } from "bun:test";
import ObjectContainer from "../../../packages/client/src/world/object_container";
import type GameObject from "../../../packages/client/src/world/game_object";

function stub(
  id: number,
  update: (now?: number) => boolean = () => false,
): GameObject {
  return { id, update } as GameObject;
}

describe("ObjectContainer", () => {
  let container: ObjectContainer;

  beforeEach(() => {
    container = new ObjectContainer();
  });

  test("rejects a different object with an existing id without replacing it", () => {
    const original = stub(1);
    const collision = stub(1);
    container.add(original);

    expect(() => container.add(collision)).toThrow(
      "Client object 1 already exists",
    );
    expect(container.get(1)).toBe(original);
    expect(container.updating.has(collision)).toBe(false);
  });

  test("updates active interpolations with the caller's timestamp", () => {
    const update = mock(() => false);
    const object = stub(1, update);
    container.add(object);

    container.update(1_234);

    expect(update).toHaveBeenCalledWith(1_234);
    expect(container.updating.has(object)).toBe(true);
  });

  test("stops updating completed objects without deleting them", () => {
    const complete = stub(1, () => true);
    const active = stub(2, () => false);
    container.add(complete);
    container.add(active);

    container.update(100);
    container.update(200);

    expect(container.updating.has(complete)).toBe(false);
    expect(container.updating.has(active)).toBe(true);
    expect([...container.all()]).toEqual([complete, active]);
  });
});
