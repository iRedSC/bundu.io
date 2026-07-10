import { describe, expect, test, beforeEach } from "bun:test";
import { ReversableMap } from "./reverseable_map";

describe("ReversableMap", () => {
  let map: ReversableMap<string, number>;

  beforeEach(() => {
    map = new ReversableMap<string, number>();
  });

  test("starts empty", () => {
    expect(map.size).toBe(0);
    expect(map.get("a")).toBeUndefined();
    expect(map.getv(1)).toBeUndefined();
    expect(map.has("a")).toBe(false);
    expect(map.hasv(1)).toBe(false);
  });

  test("set associates key→value and reverse lookup", () => {
    map.set("a", 1);
    expect(map.get("a")).toBe(1);
    expect(map.getv(1)).toBe("a");
    expect(map.has("a")).toBe(true);
    expect(map.hasv(1)).toBe(true);
    expect(map.size).toBe(1);
  });

  test("set returns this for chaining", () => {
    expect(map.set("a", 1)).toBe(map);
    map.set("b", 2).set("c", 3);
    expect(map.size).toBe(3);
    expect(map.getv(3)).toBe("c");
  });

  test("overwriting same key with same value is fine", () => {
    map.set("a", 1);
    expect(() => map.set("a", 1)).not.toThrow();
    expect(map.get("a")).toBe(1);
    expect(map.getv(1)).toBe("a");
    expect(map.size).toBe(1);
  });

  test("updating existing key removes old reverse mapping", () => {
    map.set("a", 1);
    map.set("a", 2);
    expect(map.get("a")).toBe(2);
    expect(map.getv(2)).toBe("a");
    expect(map.hasv(1)).toBe(false);
    expect(map.getv(1)).toBeUndefined();
    expect(map.size).toBe(1);
  });

  test("duplicate value from a different key throws", () => {
    map.set("a", 1);
    expect(() => map.set("b", 1)).toThrow();
    expect(map.get("b")).toBeUndefined();
    expect(map.getv(1)).toBe("a");
    expect(map.size).toBe(1);
  });

  test("get / has return undefined / false for missing keys", () => {
    expect(map.get("missing")).toBeUndefined();
    expect(map.has("missing")).toBe(false);
  });

  test("getv / hasv return undefined / false for missing values", () => {
    expect(map.getv(99)).toBeUndefined();
    expect(map.hasv(99)).toBe(false);
  });

  test("delete removes forward and reverse entries", () => {
    map.set("a", 1).set("b", 2);
    expect(map.delete("a")).toBe(true);
    expect(map.has("a")).toBe(false);
    expect(map.hasv(1)).toBe(false);
    expect(map.get("a")).toBeUndefined();
    expect(map.getv(1)).toBeUndefined();
    expect(map.get("b")).toBe(2);
    expect(map.size).toBe(1);
  });

  test("delete returns false for missing key", () => {
    expect(map.delete("nope")).toBe(false);
  });

  test("deletev removes by value and corresponding key", () => {
    map.set("a", 1).set("b", 2);
    expect(map.deletev(1)).toBe(true);
    expect(map.has("a")).toBe(false);
    expect(map.hasv(1)).toBe(false);
    expect(map.getv(1)).toBeUndefined();
    expect(map.get("b")).toBe(2);
    expect(map.size).toBe(1);
  });

  test("deletev returns false for missing value", () => {
    expect(map.deletev(99)).toBe(false);
  });

  test("clear removes all mappings", () => {
    map.set("a", 1).set("b", 2);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(false);
    expect(map.hasv(1)).toBe(false);
    expect(map.hasv(2)).toBe(false);
    expect(map.get("a")).toBeUndefined();
    expect(map.getv(1)).toBeUndefined();
  });

  test("works with object keys and values by identity", () => {
    const keyA = { id: 1 };
    const keyB = { id: 2 };
    const valX = { name: "x" };
    const valY = { name: "y" };
    const objMap = new ReversableMap<{ id: number }, { name: string }>();

    objMap.set(keyA, valX).set(keyB, valY);
    expect(objMap.get(keyA)).toBe(valX);
    expect(objMap.getv(valX)).toBe(keyA);
    expect(objMap.hasv(valY)).toBe(true);

    expect(() => objMap.set(keyA, valY)).toThrow();

    const otherX = { name: "x" };
    expect(objMap.getv(otherX)).toBeUndefined();
    expect(objMap.hasv(otherX)).toBe(false);

    expect(objMap.deletev(valX)).toBe(true);
    expect(objMap.has(keyA)).toBe(false);
    expect(objMap.size).toBe(1);
  });

  test("forward and reverse stay in sync across mixed ops", () => {
    map.set("a", 1).set("b", 2).set("c", 3);
    map.delete("b");
    map.set("b", 4);
    map.deletev(1);
    map.set("a", 5);

    expect(map.size).toBe(3);
    expect(map.get("a")).toBe(5);
    expect(map.get("b")).toBe(4);
    expect(map.get("c")).toBe(3);
    expect(map.getv(5)).toBe("a");
    expect(map.getv(4)).toBe("b");
    expect(map.getv(3)).toBe("c");
    expect(map.hasv(1)).toBe(false);
    expect(map.hasv(2)).toBe(false);
  });
});
