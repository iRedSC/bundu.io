import { describe, expect, test } from "bun:test";
import { Serializer } from "@bundu/shared";
import { ServerPacketReceiver } from "../../../../packages/server/src/engine/network/packets/server_receiver";

const schema = {
  1: { fields: ["value"] as const },
  2: { fields: ["value"] as const },
};
type Packets = {
  1: { value: number };
  2: { value: number };
};

describe("ServerPacketReceiver limits", () => {
  test("coalesces latest-wins state", () => {
    const receiver = new ServerPacketReceiver<Packets>(
      new Serializer<Packets>(schema),
      undefined,
      { latestWinsIds: new Set([1]) },
    );
    const values: number[] = [];
    receiver.on(1, (_playerId, packet) => values.push(packet.value));

    expect(receiver.add(1, [1, 1])).toBe("queued");
    expect(receiver.add(1, [1, 2])).toBe("coalesced");
    receiver.process();
    expect(values).toEqual([2]);
  });

  test("disconnects on reliable overflow", () => {
    const receiver = new ServerPacketReceiver<Packets>(
      new Serializer<Packets>(schema),
      undefined,
      { maxReliableQueue: 1 },
    );
    expect(receiver.add(1, [2, 1])).toBe("queued");
    expect(receiver.add(1, [2, 2])).toBe("disconnect");
  });

  test("can explicitly drop overflow without growing the queue", () => {
    const receiver = new ServerPacketReceiver<Packets>(
      new Serializer<Packets>(schema),
      undefined,
      { maxReliableQueue: 0, overflowOutcome: "dropped" },
    );
    expect(receiver.add(1, [2, 1])).toBe("dropped");
  });

  test("rotates a global tick budget fairly", () => {
    const receiver = new ServerPacketReceiver<Packets>(
      new Serializer<Packets>(schema),
      undefined,
      { maxPacketsPerPlayerTick: 1, maxPacketsGlobalTick: 1 },
    );
    const players: number[] = [];
    receiver.on(2, (playerId) => players.push(playerId));
    receiver.add(1, [2, 1]);
    receiver.add(2, [2, 2]);
    receiver.process();
    receiver.clear();
    receiver.process();
    expect(players).toEqual([1, 2]);
  });
});
