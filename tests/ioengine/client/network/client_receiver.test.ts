import { describe, expect, test, beforeEach } from "bun:test";
import { Serializer } from "@bundu/shared";
import {
  ClientPacketReceiver,
  type SerializedPacketArray,
} from "../../../../packages/client/src/network/client_receiver";

const TestSchema = {
  1: {
    fields: ["a", "b"] as const,
  },
  2: {
    fields: ["value"] as const,
  },
  3: {
    fields: ["n"] as const,
  },
} as const;

type TestDataMap = {
  1: { a: number; b: string };
  2: { value: number };
  3: { n: number };
};

describe("ClientPacketReceiver", () => {
  let serializer: Serializer<typeof TestSchema, TestDataMap>;
  let receiver: ClientPacketReceiver<typeof TestSchema, TestDataMap>;

  beforeEach(() => {
    serializer = new Serializer(TestSchema) as Serializer<
      typeof TestSchema,
      TestDataMap
    >;
    receiver = new ClientPacketReceiver(serializer);
  });

  test("process dispatches registered callbacks with deserialized data and batch timestamp", () => {
    const seen: Array<{ packet: TestDataMap[1] | TestDataMap[2]; ts: number }> =
      [];

    receiver.on(1, (packet, timestamp) => {
      seen.push({ packet, ts: timestamp });
    });
    receiver.on(2, (packet, timestamp) => {
      seen.push({ packet, ts: timestamp });
    });

    const packets: SerializedPacketArray = [
      1_500,
      [1, 42, "hi"],
      [2, 99],
    ];
    receiver.process(packets);

    expect(seen).toHaveLength(2);
    expect(seen[0]?.ts).toBe(1_500);
    expect(seen[0]?.packet).toMatchObject({ a: 42, b: "hi" });
    expect(seen[1]?.ts).toBe(1_500);
    expect(seen[1]?.packet).toMatchObject({ value: 99 });
  });

  test("continues processing remaining packets when one deserialize fails", () => {
    const seen: number[] = [];
    const error = console.error;
    console.error = () => {};

    try {
      receiver.on(1, (packet) => {
        seen.push(packet.a);
      });
      receiver.on(2, (packet) => {
        seen.push(packet.value);
      });

      // id 999 is unknown to the schema → deserialize throws and is dropped
      const packets: SerializedPacketArray = [
        100,
        [1, 10, "ok"],
        [999, "bad"],
        [2, 20],
      ];
      expect(() => receiver.process(packets)).not.toThrow();
      expect(seen).toEqual([10, 20]);
    } finally {
      console.error = error;
    }
  });

  test("silently skips packets with no registered callback", () => {
    const seen: unknown[] = [];
    receiver.on(1, (packet) => {
      seen.push(packet);
    });

    const packets: SerializedPacketArray = [50, [2, 7], [1, 1, "x"]];
    expect(() => receiver.process(packets)).not.toThrow();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ a: 1, b: "x" });
  });
});
