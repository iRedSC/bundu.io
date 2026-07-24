import { describe, expect, test } from "bun:test";
import { Attributes } from "@bundu/server/components/attributes";
import { Physics } from "@bundu/server/components/base";
import { Inventory } from "@bundu/server/components/inventory";
import { ItemLocks } from "@bundu/server/components/item_locks";
import { PlayerData } from "@bundu/server/components/player";
import { GameObject, World, type ServerContext } from "@bundu/server/engine";
import { applyLockItem } from "@bundu/server/network/item_locks";
import { PlayerSystem } from "@bundu/server/systems/player";
import { ServerPacket } from "@bundu/shared/packet_definitions";

class Player extends GameObject {}

type EmittedPacket = {
  id: number;
  packet: number;
  payload: unknown;
};

function context(
  playerPackets: EmittedPacket[],
  worldPackets: EmittedPacket[],
): ServerContext {
  return {
    socketManager: {
      getSocket: () => ({}),
    },
    playerPacketManager: {
      set: (id: number, packet: number, payload: unknown) => {
        playerPackets.push({ id, packet, payload });
      },
    },
    worldPacketManager: {
      set: () => {},
      emit: (packet: number, payload: unknown) => {
        worldPackets.push({ id: -1, packet, payload });
      },
    },
    pendingSessionEnds: [],
  } as unknown as ServerContext;
}

function playerData(overrides: Partial<ReturnType<typeof PlayerData.get>>) {
  const component = new PlayerData();
  Object.assign(component.data, overrides);
  return component;
}

describe("PlayerSystem item lock integration", () => {
  test("acknowledges accepted and rejected selections with authoritative state", () => {
    const playerPackets: EmittedPacket[] = [];
    const world = new World();
    world.context = context(playerPackets, []);
    const system = new PlayerSystem(world);
    const player = new Player()
      .add(playerData({ clientReady: true }))
      .add(
        new Inventory({
          selected: 0,
          cursor: null,
          slots: [null, null],
        }),
      );
    world.addObject(player);

    system.selectItem(player.id, { slot: 1 });
    system.selectItem(player.id, { slot: 2 });

    expect(Inventory.get(player).selected).toBe(1);
    expect(playerPackets).toEqual([
      {
        id: player.id,
        packet: ServerPacket.SelectItemResult,
        payload: { requested: 1, selected: 1, accepted: true },
      },
      {
        id: player.id,
        packet: ServerPacket.SelectItemResult,
        payload: { requested: 2, selected: 1, accepted: false },
      },
    ]);
  });

  test("cancels active eating and blocking when use becomes locked", () => {
    const worldPackets: EmittedPacket[] = [];
    const world = new World();
    world.context = context([], worldPackets);
    const system = new PlayerSystem(world);
    const player = new Player()
      .add(
        playerData({
          clientReady: true,
          mainHand: 10,
          offHand: 20,
          blocking: true,
          eating: { itemId: 20, endsAt: 10_000 },
        }),
      )
      .add(new Physics())
      .add(new Attributes())
      .add(new ItemLocks());
    const attributes = Attributes.get(player);
    attributes.set("movement.speed", "eating", "multiply", 0.5);
    attributes.set("health.defense", "blocking", "add", 5);
    applyLockItem(
      player,
      {
        source: "test",
        items: new Set([10, 20]),
        lock: ["use"],
        slots: ["mainhand", "offhand"],
      },
      0,
    );

    system.update(1, 1, player);

    expect(PlayerData.get(player)).toMatchObject({
      eating: undefined,
      blocking: false,
    });
    expect(attributes.types["movement.speed"]?.eating).toBeUndefined();
    expect(attributes.types["health.defense"]?.blocking).toBeUndefined();
    expect(worldPackets).toEqual([
      {
        id: -1,
        packet: ServerPacket.EatEvent,
        payload: { id: player.id, duration: 0 },
      },
      {
        id: -1,
        packet: ServerPacket.BlockEvent,
        payload: { id: player.id, stop: true },
      },
    ]);
  });
});
