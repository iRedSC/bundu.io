import { describe, expect, test, beforeEach } from "bun:test";
import { Serializer } from "@ioengine/shared";

const TestSchema = {
  1: {
    fields: ["a", "b"] as const,
  },
  2: {
    fields: [] as const,
  },
  3: {
    fields: ["x", "y", "z"] as const,
  },
} as const;

type TestDataMap = {
  1: { a: number; b: string };
  2: {};
  3: { x: number; y: number; z: number };
};

describe("Serializer", () => {
  let serializer: Serializer<typeof TestSchema, TestDataMap>;

  beforeEach(() => {
    serializer = new Serializer(TestSchema) as Serializer<
      typeof TestSchema,
      TestDataMap
    >;
  });

  test("serialize packs id then fields in schema order", () => {
    const packet = serializer.serialize(1, { a: 42, b: "hi" });
    expect(packet).toEqual([1, 42, "hi"]);
  });

  test("serialize with empty fields yields [id] only", () => {
    const packet = serializer.serialize(2, {});
    expect(packet).toEqual([2]);
  });

  test("serialize ignores extra keys not listed in fields", () => {
    const packet = serializer.serialize(1, {
      a: 1,
      b: "x",
      extra: true,
    } as TestDataMap[1] & { extra: boolean });
    expect(packet).toEqual([1, 1, "x"]);
    expect(packet).toHaveLength(3);
  });

  test("serialize field order matches fields array", () => {
    const packet = serializer.serialize(3, { x: 10, y: 20, z: 30 });
    expect(packet).toEqual([3, 10, 20, 30]);
  });

  test("deserialize reconstructs fields and attaches id", () => {
    const result = serializer.deserialize([1, 7, "ok"]);
    expect(result).toEqual({ id: 1, a: 7, b: "ok" });
    expect(result.id).toBe(1);
  });

  test("deserialize empty fields packet attaches id", () => {
    const result = serializer.deserialize([2]);
    expect(result).toEqual({ id: 2 });
    expect(result.id).toBe(2);
  });

  test("round-trip serialize then deserialize recovers fields and id", () => {
    const data = { a: 99, b: "round" };
    const packet = serializer.serialize(1, data);
    const restored = serializer.deserialize(packet);
    expect(restored).toEqual({ id: 1, a: 99, b: "round" });
  });

  test("round-trip empty fields packet", () => {
    const packet = serializer.serialize(2, {});
    const restored = serializer.deserialize(packet);
    expect(restored).toEqual({ id: 2 });
  });

  test("serialize unknown schema id throws mentioning schema/not found", () => {
    expect(() =>
      serializer.serialize(999 as unknown as 1, { a: 1, b: "x" }),
    ).toThrow(/schema|not found/i);
  });

  test("deserialize unknown schema id throws", () => {
    expect(() =>
      serializer.deserialize([999 as unknown as 1, 1, "x"]),
    ).toThrow(/schema|not found/i);
  });

  test("deserialize field count mismatch throws", () => {
    expect(() =>
      serializer.deserialize([1, 7] as unknown as [1, ...unknown[]]),
    ).toThrow(/mismatch/i);
  });

  test("deserialize too many fields throws", () => {
    expect(() =>
      serializer.deserialize([1, 7, "ok", "extra"] as unknown as [
        1,
        ...unknown[],
      ]),
    ).toThrow(/mismatch/i);
  });
});
