import { describe, expect, test } from "bun:test";
import { Serializer } from "@bundu/shared";
import {
  ServerPacket,
  ServerSchema,
  type ServerPacketMap,
} from "@bundu/shared/packet_definitions";
import { GameObject } from "@bundu/server/engine";
import { WorldPacketManager } from "../../../../packages/server/src/engine/network/packets/world";

class Entity extends GameObject {}

describe("WorldPacketManager", () => {
  test("keeps latest state, preserves every event, and filters by visibility", () => {
    const manager = new WorldPacketManager(
      new Serializer<ServerPacketMap>(ServerSchema),
    );
    const visible = new Entity();
    const hidden = new Entity();

    manager.set(ServerPacket.SetPosition, {
      id: visible.id,
      x: 10,
      y: 20,
    });
    manager.set(ServerPacket.SetPosition, {
      id: visible.id,
      x: 30,
      y: 40,
    });
    manager.emit(ServerPacket.ChatMessage, {
      id: visible.id,
      message: "first",
    });
    manager.emit(ServerPacket.ChatMessage, {
      id: visible.id,
      message: "second",
    });
    manager.set(ServerPacket.SetPosition, {
      id: hidden.id,
      x: 99,
      y: 99,
    });

    expect(manager.process([visible].values())).toEqual([
      [ServerPacket.SetPosition, visible.id, 30, 40],
      [ServerPacket.ChatMessage, visible.id, "first"],
      [ServerPacket.ChatMessage, visible.id, "second"],
    ]);
  });

  test("process leaves queues intact until clear", () => {
    const manager = new WorldPacketManager(
      new Serializer<ServerPacketMap>(ServerSchema),
    );
    const object = new Entity();
    manager.set(ServerPacket.SetRotation, { id: object.id, rotation: 90 });
    manager.emit(ServerPacket.ChatMessage, { id: object.id, message: "event" });

    const first = manager.process([object].values());
    const second = manager.process([object].values());

    expect(first).toEqual([
      [ServerPacket.SetRotation, object.id, 90],
      [ServerPacket.ChatMessage, object.id, "event"],
    ]);
    expect(second).toEqual(first);

    manager.clear();
    expect(manager.process([object].values())).toEqual([]);
  });
});
