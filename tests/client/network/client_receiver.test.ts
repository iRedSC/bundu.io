import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { Serializer } from "@bundu/shared";
import { clientTime } from "@client/globals";
import {
  ClientPacketReceiver,
  type SerializedPacketArray,
} from "../../../packages/client/src/network/client_receiver";

const TestSchema = {
  1: { fields: ["a", "b"] as const },
  2: { fields: [] as const },
  3: { fields: ["x", "y", "z"] as const },
} as const;

type TestDataMap = {
  1: { a: number; b: string };
  2: Record<never, never>;
  3: { x: number; y: number; z: number };
};

describe("ClientPacketReceiver", () => {
  let receiver: ClientPacketReceiver<TestDataMap>;

  beforeEach(() => {
    clientTime.resetServerSync();
    receiver = new ClientPacketReceiver(new Serializer<TestDataMap>(TestSchema));
  });

  afterEach(() => {
    mock.restore();
    clientTime.resetServerSync();
  });

  test("dispatches a batch in wire order with decoded payloads and its timestamp", () => {
    const calls: Array<[TestDataMap[1] | TestDataMap[3], number]> = [];
    receiver.on(1, (packet, timestamp) => calls.push([packet, timestamp]));
    receiver.on(3, (packet, timestamp) => calls.push([packet, timestamp]));

    receiver.process([
      1_234,
      [3, 1, 2, 3],
      [1, 42, "hi"],
      [1, 7, "again"],
    ]);

    expect(calls).toEqual([
      [{ x: 1, y: 2, z: 3 }, 1_234],
      [{ a: 42, b: "hi" }, 1_234],
      [{ a: 7, b: "again" }, 1_234],
    ]);
  });

  test("replaces a packet handler when the same id is registered again", () => {
    const first = mock(() => {});
    const replacement = mock(() => {});
    receiver.on(2, first);
    receiver.on(2, replacement);

    receiver.process([10, [2]]);

    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledWith({}, 10);
  });

  test("drops malformed packets and continues the batch", () => {
    const handler = mock(() => {});
    spyOn(console, "error").mockImplementation(() => {});
    receiver.on(1, handler);

    const batch: SerializedPacketArray = [
      100,
      [99, "bad"],
      [1, 1],
      [1, 5, "ok"],
    ];
    expect(() => receiver.process(batch)).not.toThrow();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ a: 5, b: "ok" }, 100);
  });

  test("synchronizes the presentation clock from a timestamp-only batch", () => {
    spyOn(clientTime, "now").mockReturnValue(1_000);

    receiver.process([700]);

    expect(clientTime.fromServer(800)).toBe(1_100);
  });
});
