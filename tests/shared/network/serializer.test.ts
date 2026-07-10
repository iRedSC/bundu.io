import { describe, expect, test } from "bun:test";
import { Serializer } from "@bundu/shared";

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

describe("Serializer", () => {
  const serializer = new Serializer<TestDataMap>(TestSchema);

  describe("has", () => {
    test("returns true for known ids", () => {
      expect(serializer.has(1)).toBe(true);
      expect(serializer.has(2)).toBe(true);
      expect(serializer.has(3)).toBe(true);
    });

    test("returns false for unknown ids", () => {
      expect(serializer.has(0)).toBe(false);
      expect(serializer.has(99)).toBe(false);
    });
  });

  describe("serialize", () => {
    test("packs fields in schema order", () => {
      expect(serializer.serialize(1, { a: 42, b: "hi" })).toEqual([
        1,
        42,
        "hi",
      ]);
      expect(serializer.serialize(3, { x: 1, y: 2, z: 3 })).toEqual([
        3, 1, 2, 3,
      ]);
    });

    test("empty fields yields [id] only", () => {
      expect(serializer.serialize(2, {})).toEqual([2]);
    });

    test("ignores extra keys not in fields", () => {
      expect(
        serializer.serialize(1, {
          a: 1,
          b: "x",
          extra: true,
        } as { a: number; b: string }),
      ).toEqual([1, 1, "x"]);
    });

    test("throws for unknown id", () => {
      expect(() =>
        serializer.serialize(99 as keyof TestDataMap & number, {} as never),
      ).toThrow();
    });
  });

  describe("deserialize", () => {
    test("reconstructs fields without attaching packet-type id", () => {
      const result = serializer.deserialize([1, 10, "ok"]);
      expect(result).toEqual({ a: 10, b: "ok" });
      expect(result).not.toHaveProperty("id");
    });

    test("empty-fields packet yields {}", () => {
      expect(serializer.deserialize([2])).toEqual({});
    });

    test("throws for unknown id", () => {
      expect(() =>
        serializer.deserialize([99, "x"] as unknown as readonly [
          keyof TestDataMap & number,
          ...unknown[],
        ]),
      ).toThrow();
    });

    test("throws when too few fields", () => {
      expect(() => serializer.deserialize([1, 10])).toThrow();
      expect(() => serializer.deserialize([3, 1, 2])).toThrow();
    });

    test("throws when too many fields", () => {
      expect(() => serializer.deserialize([1, 10, "ok", "extra"])).toThrow();
      expect(() => serializer.deserialize([2, "extra"])).toThrow();
    });
  });

  describe("round-trip", () => {
    test("serialize then deserialize restores payload", () => {
      const data1 = { a: 7, b: "round" };
      expect(serializer.deserialize(serializer.serialize(1, data1))).toEqual(
        data1,
      );

      const data2 = {};
      expect(serializer.deserialize(serializer.serialize(2, data2))).toEqual(
        data2,
      );

      const data3 = { x: 4, y: 5, z: 6 };
      expect(serializer.deserialize(serializer.serialize(3, data3))).toEqual(
        data3,
      );
    });
  });
});
