import { describe, expect, test } from "bun:test";
import { Serializer } from "@bundu/shared";

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

describe("Serializer", () => {
  const serializer = new Serializer<TestDataMap>(TestSchema);

  test("serializes payloads in schema order", () => {
    expect(serializer.serialize(1, { b: "second", a: 42 })).toEqual([
      1,
      42,
      "second",
    ]);
    expect(serializer.serialize(2, {})).toEqual([2]);
  });

  test("deserializes wire payloads without leaking the packet id", () => {
    expect(serializer.deserialize([1, 42, "second"])).toEqual({
      a: 42,
      b: "second",
    });
    expect(serializer.deserialize([2])).toEqual({});
  });

  test("rejects unknown packet ids with an actionable error", () => {
    expect(() =>
      serializer.serialize(99 as keyof TestDataMap & number, {} as never),
    ).toThrow("Schema 99 not found");
    expect(() =>
      serializer.deserialize(
        [99] as unknown as readonly [keyof TestDataMap & number, ...unknown[]],
      ),
    ).toThrow("Schema 99 not found");
  });

  test("rejects truncated and overlong wire payloads", () => {
    expect(() => serializer.deserialize([1, 10])).toThrow(
      "Packet 1 field count mismatch: got 1, expected 2",
    );
    expect(() => serializer.deserialize([3, 1, 2, 3, 4])).toThrow(
      "Packet 3 field count mismatch: got 4, expected 3",
    );
    expect(() => serializer.deserialize([2, "unexpected"])).toThrow(
      "Packet 2 field count mismatch: got 1, expected 0",
    );
  });
});
