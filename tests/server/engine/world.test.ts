import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  Component,
  GameObject,
  System,
  World,
  type ComponentFactory,
} from "@bundu/server/engine";

type Vec = { x: number; y: number };
type TrackEvents = {
  ping: string;
  targeted: { object: GameObject; value: string };
};

class Entity extends GameObject {}

class TrackingSystem extends System<TrackEvents> {
  entered: GameObject[] = [];
  exited: GameObject[] = [];
  updates: Array<{ time: number; delta: number; object: GameObject }> = [];

  override enter(object: GameObject) {
    this.entered.push(object);
  }

  override exit(object: GameObject) {
    this.exited.push(object);
  }

  override update(time: number, delta: number, object: GameObject) {
    this.updates.push({ time, delta, object });
  }
}

describe("Component and GameObject", () => {
  let Position: ComponentFactory<Vec>;
  let Velocity: ComponentFactory<Vec>;

  beforeEach(() => {
    Position = Component.register(() => ({ x: 0, y: 0 }));
    Velocity = Component.register(() => ({ x: 0, y: 0 }));
  });

  test("component factories create independent defaults and expose object data", () => {
    const first = new Position();
    const second = new Position();
    first.data.x = 10;
    const object = new Entity().add(second);

    expect(second.data).toEqual({ x: 0, y: 0 });
    expect(Position.get(object)).toBe(second.data);
    expect(Position.id).toBe(first.id);
    expect(Velocity.id).not.toBe(Position.id);
  });

  test("add rejects duplicate component types without changing the object", () => {
    const object = new Entity();
    const first = new Position({ x: 1, y: 2 });
    object.add(first);

    expect(() => object.add(new Position({ x: 3, y: 4 }))).toThrow(
      /already has component/,
    );
    expect(object.get(Position)).toBe(first.data);
    expect(object.components).toEqual([first]);
  });

  test("subscriptions observe real component changes and can unsubscribe", () => {
    const object = new Entity();
    const events: Array<{
      added?: Component<unknown>;
      removed?: Component<unknown>;
    }> = [];
    const unsubscribe = object.subscribe((_object, added, removed) => {
      events.push({ added, removed });
    });
    const position = new Position();
    const absentVelocity = new Velocity();

    object.add(position);
    object.remove(absentVelocity);
    expect(events).toEqual([{ added: position, removed: undefined }]);
    expect(object.get(Position)).toBe(position.data);

    object.remove(position);
    unsubscribe();
    object.add(new Velocity());

    expect(events).toEqual([
      { added: position, removed: undefined },
      { added: undefined, removed: position },
    ]);
  });
});

describe("World and System", () => {
  let Position: ComponentFactory<Vec>;
  let Velocity: ComponentFactory<Vec>;
  let world: World;
  let system: TrackingSystem;

  beforeEach(() => {
    Position = Component.register(() => ({ x: 0, y: 0 }));
    Velocity = Component.register(() => ({ x: 0, y: 0 }));
    world = new World();
    system = new TrackingSystem(world, [Position, Velocity]);
    world.addSystem(system);
  });

  test("tracks objects by id without duplicating the same instance", () => {
    const object = new Entity().add(new Position()).add(new Velocity());

    expect(world.addObject(object).addObject(object)).toBe(world);
    expect(world.getObject(object.id)).toBe(object);
    expect(world.objects.size).toBe(1);

    expect(world.removeObject(object)).toBe(world);
    expect(world.getObject(object.id)).toBeUndefined();
  });

  test("enters and exits systems exactly when component eligibility changes", () => {
    const object = new Entity().add(new Position());
    const velocity = new Velocity();
    world.addObject(object);

    object.add(velocity);
    object.remove(velocity);
    object.add(velocity);
    world.removeObject(object);

    expect(system.entered).toEqual([object, object]);
    expect(system.exited).toEqual([object, object]);
  });

  test("adding a system enters each already-eligible object once", () => {
    const otherWorld = new World();
    const object = new Entity().add(new Position()).add(new Velocity());
    const lateSystem = new TrackingSystem(otherWorld, [Position, Velocity]);
    otherWorld.addObject(object);

    otherWorld.addSystem(lateSystem);

    expect(lateSystem.entered).toEqual([object]);
  });

  test("queries all required components and respects an explicit id selection", () => {
    const both = new Entity().add(new Position()).add(new Velocity());
    const onlyPosition = new Entity().add(new Position());
    const neither = new Entity();
    world.addObject(both).addObject(onlyPosition).addObject(neither);

    expect(world.query([Position, Velocity])).toEqual([both]);
    expect(world.query([Position])).toEqual([both, onlyPosition]);
    expect(world.query([], [neither.id, 999, both.id])).toEqual([
      neither,
      both,
    ]);
  });

  test("runs systems at their configured cadence with gameplay time", () => {
    const cadenceWorld = new World();
    const cadenceSystem = new TrackingSystem(cadenceWorld, [Position], 10);
    const object = new Entity().add(new Position());
    cadenceWorld.addSystem(cadenceSystem).addObject(object);

    cadenceWorld.step(40);
    cadenceWorld.step(60);
    cadenceWorld.step(250);

    expect(cadenceWorld.gameTime).toBe(350);
    expect(cadenceSystem.updates).toEqual([
      { time: 100, delta: 100, object },
      { time: 350, delta: 100, object },
    ]);
  });

  test("removes inactive objects before systems can update them", () => {
    const object = new Entity().add(new Position()).add(new Velocity());
    world.addObject(object);
    object.active = false;

    world.update();

    expect(world.getObject(object.id)).toBeUndefined();
    expect(system.updates).toEqual([]);
    expect(system.exited).toEqual([object]);
  });

  test("dispatches persistent and once-only listeners", () => {
    const persistent: string[] = [];
    const once: string[] = [];
    system.listen("ping", (value) => persistent.push(value));
    system.listen("ping", (value) => once.push(value), undefined, true);

    system.trigger("ping", "a");
    system.trigger("ping", "b");

    expect(persistent).toEqual(["a", "b"]);
    expect(once).toEqual(["a"]);
  });

  test("filters object events by listener component requirements", () => {
    const listener = mock(() => {});
    const eligible = new Entity().add(new Position());
    const ineligible = new Entity();
    system.listen("targeted", listener, [Position]);

    system.trigger("targeted", { object: ineligible, value: "no" });
    system.trigger("targeted", { object: eligible, value: "yes" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ object: eligible, value: "yes" });
  });

  test("rejects systems constructed for another world", () => {
    expect(() => new World().addSystem(system)).toThrow("System already in use.");
  });

  test("removing a system exits tracked objects and detaches future changes", () => {
    const object = new Entity().add(new Position()).add(new Velocity());
    world.addObject(object);

    expect(world.removeSystem(system)).toBe(world);
    object.remove(new Velocity());
    object.add(new Velocity());

    expect(system.exited).toEqual([object]);
    expect(system.entered).toEqual([object]);
    expect(world.systems.has(system.id)).toBe(false);
  });

  test("destroy clears registries and unsubscribes from retained objects", () => {
    const object = new Entity().add(new Position());
    world.addObject(object);

    world.destroy();
    object.add(new Velocity());

    expect(world.objects.size).toBe(0);
    expect(world.systems.size).toBe(0);
    expect(system.entered).toEqual([]);
  });
});
