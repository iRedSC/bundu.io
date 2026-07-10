import { describe, expect, test, beforeEach, mock } from "bun:test";
import { Serializer } from "@bundu/shared";
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
  2: {};
  3: { x: number; y: number; z: number };
};

describe("ClientPacketReceiver", () => {
  let serializer: Serializer<TestDataMap>;
  let receiver: ClientPacketReceiver<TestDataMap>;

  beforeEach(() => {
    serializer = new Serializer<TestDataMap>(TestSchema);
    receiver = new ClientPacketReceiver<TestDataMap>(serializer);
  });

  test("dispatches registered callbacks with deserialized data and batch timestamp", () => {
    const on1 = mock((_packet: TestDataMap[1], _timestamp: number) => {});
    const on3 = mock((_packet: TestDataMap[3], _timestamp: number) => {});

    receiver.on(1, on1);
    receiver.on(3, on3);

    const batch: SerializedPacketArray = [
      1234,
      [1, 42, "hi"],
      [3, 1, 2, 3],
    ];
    receiver.process(batch);

    expect(on1).toHaveBeenCalledTimes(1);
    expect(on1).toHaveBeenCalledWith({ a: 42, b: "hi" }, 1234);
    expect(on1.mock.calls[0]![0]).not.toHaveProperty("id");

    expect(on3).toHaveBeenCalledTimes(1);
    expect(on3).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 }, 1234);
    expect(on3.mock.calls[0]![0]).not.toHaveProperty("id");
  });

  test("empty-fields packet dispatches {}", () => {
    const on2 = mock((_packet: TestDataMap[2], _timestamp: number) => {});
    receiver.on(2, on2);

    receiver.process([999, [2]]);

    expect(on2).toHaveBeenCalledTimes(1);
    expect(on2).toHaveBeenCalledWith({}, 999);
    expect(on2.mock.calls[0]![0]).not.toHaveProperty("id");
  });

  test("continues after a bad/unknown packet without throwing", () => {
    const on1 = mock((_packet: TestDataMap[1], _timestamp: number) => {});
    receiver.on(1, on1);

    expect(() =>
      receiver.process([
        100,
        [99, "bad"],
        [1, 1],
        [1, 5, "ok"],
      ]),
    ).not.toThrow();

    expect(on1).toHaveBeenCalledTimes(1);
    expect(on1).toHaveBeenCalledWith({ a: 5, b: "ok" }, 100);
  });

  test("skips packets with no registered callback", () => {
    const on1 = mock((_packet: TestDataMap[1], _timestamp: number) => {});
    receiver.on(1, on1);

    expect(() =>
      receiver.process([
        50,
        [3, 1, 2, 3],
        [1, 9, "yes"],
      ]),
    ).not.toThrow();

    expect(on1).toHaveBeenCalledTimes(1);
    expect(on1).toHaveBeenCalledWith({ a: 9, b: "yes" }, 50);
  });
});
