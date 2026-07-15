import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { Serializer, type PacketGuards } from "@bundu/shared";
import { ServerPacketReceiver } from "../../../../packages/server/src/engine/network/packets/server_receiver";

const TestSchema = {
  1: { fields: ["value"] as const },
  2: { fields: ["message"] as const },
} as const;

type TestDataMap = {
  1: { value: number };
  2: { message: string };
};

const guards: PacketGuards<TestDataMap> = {
  1: (data): data is TestDataMap[1] =>
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>).value === "number",
  2: (data): data is TestDataMap[2] =>
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>).message === "string",
};

describe("ServerPacketReceiver", () => {
  let receiver: ServerPacketReceiver<TestDataMap>;

  beforeEach(() => {
    receiver = new ServerPacketReceiver(
      new Serializer<TestDataMap>(TestSchema),
      guards,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  test("dispatches queued packets with their player id in arrival order", () => {
    const calls: Array<[number, number | string]> = [];
    receiver.on(1, (playerId, packet) => calls.push([playerId, packet.value]));
    receiver.on(2, (playerId, packet) => calls.push([playerId, packet.message]));

    receiver.add(7, [1, 10]);
    receiver.add(7, [2, "hello"]);
    receiver.add(9, [1, 20]);
    receiver.process();

    expect(calls).toEqual([
      [7, 10],
      [7, "hello"],
      [9, 20],
    ]);
  });

  test("drops invalid values and malformed packets without blocking later work", () => {
    const calls: number[] = [];
    const error = spyOn(console, "error").mockImplementation(() => {});
    receiver.on(1, (_playerId, packet) => calls.push(packet.value));

    receiver.add(7, [1, "not-a-number"]);
    receiver.add(7, [1]);
    receiver.add(7, [1, 42]);
    receiver.process();

    expect(calls).toEqual([42]);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0]?.slice(0, 2)).toEqual([
      "Dropped bad packet from player 7",
      [1, "not-a-number"],
    ]);
  });

  test("clear prevents processed packets from being replayed", () => {
    const handler = mock(() => {});
    receiver.on(1, handler);
    receiver.add(7, [1, 10]);
    receiver.process();

    receiver.clear();
    receiver.process();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(receiver.packets.size).toBe(0);
  });
});
