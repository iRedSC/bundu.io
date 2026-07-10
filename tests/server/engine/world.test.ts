import { describe, expect, test, beforeEach } from "bun:test";
import {
  Component,
  GameObject,
  System,
  World,
  type ComponentFactory,
} from "@bundu/server/engine";

type Vec = { x: number; y: number };

class Entity extends GameObject {}

type TrackEvents = { ping: string };

class TrackingSystem extends System<TrackEvents> {
  entered: GameObject[] = [];
  exited: GameObject[] = [];

  constructor(
    world: World,
    components: ComponentFactory<Vec>[],
    tps?: number
  ) {
    super(world, components, tps);
  }

  override enter(object: GameObject) {
    this.entered.push(object);
  }

  override exit(object: GameObject) {
    this.exited.push(object);
  }
}

describe("Component.register", () => {
  test("factory id is stable; default and custom data; Factory.get reads object", () => {
    const Position = Component.register<Vec>(() => ({ x: 0, y: 0 }));
    const Velocity = Component.register<Vec>(() => ({ x: 1, y: 1 }));

    const positionId = Position.id;
    expect(Velocity.id).not.toBe(positionId);

    const def = new Position();
    expect(def.id).toBe(positionId);
    expect(Position.id).toBe(positionId);
    expect(def.data).toEqual({ x: 0, y: 0 });

    const custom = new Position({ x: 3, y: 4 });
    expect(custom.id).toBe(positionId);
    expect(custom.data).toEqual({ x: 3, y: 4 });

    const obj = new Entity().add(new Position({ x: 9, y: 8 }));
    expect(Position.get(obj)).toEqual({ x: 9, y: 8 });
  });
});

describe("GameObject", () => {
  let Position: ComponentFactory<Vec>;
  let Velocity: ComponentFactory<Vec>;

  beforeEach(() => {
    Position = Component.register(() => ({ x: 0, y: 0 }));
    Velocity = Component.register(() => ({ x: 0, y: 0 }));
  });

  test("unique ids; add/remove/has/get; subscribe and unsubscribe; chaining", () => {
    const a = new Entity();
    const b = new Entity();
    expect(a.id).not.toBe(b.id);
    expect(a.active).toBe(true);

    const events: Array<{
      added?: Component<unknown>;
      removed?: Component<unknown>;
    }> = [];
    const unsub = a.subscribe((_obj, added, removed) => {
      events.push({ added, removed });
    });

    const pos = new Position({ x: 1, y: 2 });
    const vel = new Velocity({ x: 3, y: 4 });

    expect(a.add(pos)).toBe(a);
    expect(a.add(vel)).toBe(a);
    expect(events).toHaveLength(2);
    expect(events[0]?.added).toBe(pos);
    expect(events[0]?.removed).toBeUndefined();
    expect(events[1]?.added).toBe(vel);

    expect(a.hasComponents([])).toBe(true);
    expect(a.hasComponents([Position])).toBe(true);
    expect(a.hasComponents([Position, Velocity])).toBe(true);

    expect(a.get(Position)).toEqual({ x: 1, y: 2 });
    expect(a.get(Velocity)).toEqual({ x: 3, y: 4 });

    expect(a.remove(pos)).toBe(a);
    expect(events).toHaveLength(3);
    expect(events[2]?.added).toBeUndefined();
    expect(events[2]?.removed?.id).toBe(pos.id);
    expect(a.hasComponents([Position])).toBe(false);
    expect(a.get(Position)).toBeUndefined();
    expect(a.hasComponents([Velocity])).toBe(true);

    unsub();
    a.add(new Position({ x: 5, y: 6 }));
    expect(events).toHaveLength(3);
  });

  test("get(all) returns every matching component's data", () => {
    const obj = new Entity()
      .add(new Position({ x: 1, y: 1 }))
      .add(new Position({ x: 2, y: 2 }));

    expect(obj.get(Position, true)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });
});

describe("World + System", () => {
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

  test("addObject / getObject / removeObject", () => {
    const obj = new Entity().add(new Position()).add(new Velocity());

    expect(world.addObject(obj)).toBe(world);
    expect(world.getObject(obj.id)).toBe(obj);
    expect(world.addObject(obj)).toBe(world);
    expect(world.objects.size).toBe(1);

    expect(world.removeObject(obj)).toBe(world);
    expect(world.getObject(obj.id)).toBeUndefined();
  });

  test("enter when object qualifies; exit when it no longer qualifies or is removed", () => {
    const obj = new Entity().add(new Position());
    world.addObject(obj);
    expect(system.entered).toHaveLength(0);

    obj.add(new Velocity());
    expect(system.entered).toEqual([obj]);

    obj.remove(new Velocity());
    expect(system.exited).toEqual([obj]);

    obj.add(new Velocity());
    expect(system.entered).toEqual([obj, obj]);

    world.removeObject(obj);
    expect(system.exited).toEqual([obj, obj]);
  });

  test("query returns objects with all listed components", () => {
    const both = new Entity().add(new Position()).add(new Velocity());
    const onlyPos = new Entity().add(new Position());
    world.addObject(both).addObject(onlyPos);

    expect(world.query([Position, Velocity])).toEqual([both]);
    expect(world.query([Position])).toEqual(
      expect.arrayContaining([both, onlyPos])
    );
    expect(world.query([Position], [both.id])).toEqual([both]);
    expect(world.query([])).toEqual(expect.arrayContaining([both, onlyPos]));
  });

  test("addSystem throws if system is already attached to a world", () => {
    const other = new World();
    expect(() => other.addSystem(system)).toThrow(/already in use/i);
  });

  test("inactive object is removed on update", () => {
    const obj = new Entity().add(new Position()).add(new Velocity());
    world.addObject(obj);
    obj.active = false;
    world.update();
    expect(world.getObject(obj.id)).toBeUndefined();
  });

  test("listen + trigger delivers; once listeners fire only once", () => {
    const received: string[] = [];
    const onceReceived: string[] = [];

    system.listen("ping", (data) => {
      received.push(data);
    });
    system.listen(
      "ping",
      (data) => {
        onceReceived.push(data);
      },
      undefined,
      true
    );

    system.trigger("ping", "a");
    system.trigger("ping", "b");

    expect(received).toEqual(["a", "b"]);
    expect(onceReceived).toEqual(["a"]);
  });
});
