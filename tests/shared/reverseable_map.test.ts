import { beforeEach, describe, expect, test } from "bun:test";
import { ReversableMap } from "@bundu/shared";

describe("ReversableMap", () => {
  let map: ReversableMap<string, number>;

  beforeEach(() => {
    map = new ReversableMap<string, number>();
  });

  test("maintains a one-to-one association in both directions", () => {
    expect(map.set("a", 1).set("b", 2)).toBe(map);

    expect(map.get("a")).toBe(1);
    expect(map.getv(1)).toBe("a");
    expect(map.get("b")).toBe(2);
    expect(map.getv(2)).toBe("b");
    expect(map.size).toBe(2);
  });

  test("reassigning a key removes its stale reverse association", () => {
    map.set("a", 1).set("b", 2);

    map.set("a", 3);

    expect(map.get("a")).toBe(3);
    expect(map.getv(3)).toBe("a");
    expect(map.hasv(1)).toBe(false);
    expect(map.get("b")).toBe(2);
    expect(map.size).toBe(2);
  });

  test("rejects duplicate values without changing either association", () => {
    map.set("a", 1).set("b", 2);

    expect(() => map.set("b", 1)).toThrow("Value already exists in map.");

    expect(map.get("a")).toBe(1);
    expect(map.getv(1)).toBe("a");
    expect(map.get("b")).toBe(2);
    expect(map.getv(2)).toBe("b");
    expect(map.size).toBe(2);
  });

  test("deletes complete associations by key or value", () => {
    map.set("a", 1).set("b", 2).set("c", 3);

    expect(map.delete("a")).toBe(true);
    expect(map.deletev(2)).toBe(true);
    expect(map.delete("missing")).toBe(false);
    expect(map.deletev(99)).toBe(false);

    expect(map.has("a")).toBe(false);
    expect(map.hasv(1)).toBe(false);
    expect(map.has("b")).toBe(false);
    expect(map.hasv(2)).toBe(false);
    expect([...map.entries()]).toEqual([["c", 3]]);
  });

  test("reassigning the same key and value is idempotent", () => {
    map.set("a", 1);
    expect(map.set("a", 1)).toBe(map);
    expect(map.get("a")).toBe(1);
    expect(map.getv(1)).toBe("a");
    expect(map.size).toBe(1);
  });

  test("supports undefined keys and values with normal Map semantics", () => {
    const values = new ReversableMap<string, number | undefined>();
    values.set("unset", undefined);

    expect(values.has("unset")).toBe(true);
    expect(values.hasv(undefined)).toBe(true);
    expect(values.delete("unset")).toBe(true);
    expect(values.hasv(undefined)).toBe(false);

    const keys = new ReversableMap<string | undefined, number>();
    keys.set(undefined, 1);

    expect(keys.has(undefined)).toBe(true);
    expect(keys.deletev(1)).toBe(true);
    expect(keys.has(undefined)).toBe(false);
  });

  test("clear removes both indexes", () => {
    map.set("a", 1).set("b", 2);

    map.clear();

    expect(map.size).toBe(0);
    expect(map.hasv(1)).toBe(false);
    expect(map.hasv(2)).toBe(false);
  });
});
