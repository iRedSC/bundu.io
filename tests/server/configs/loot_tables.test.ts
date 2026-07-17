import { describe, expect, test } from "bun:test";
import {
  evaluateLoot,
  type FixedLootTable,
  type LootTable,
  type PoolLootTable,
} from "@bundu/server/configs/loaders/loot_tables";
import type { RegistryId } from "@bundu/shared/registry";

const ITEM_A = 101 as RegistryId<"item">;
const ITEM_B = 102 as RegistryId<"item">;
const ITEM_C = 103 as RegistryId<"item">;

function entries(result: ReadonlyMap<RegistryId<"item">, number>): [number, number][] {
  return [...result.entries()]
    .map(([itemId, count]) => [itemId as number, count] as [number, number])
    .sort(([left], [right]) => left - right);
}

function fixedTable(): FixedLootTable {
  return {
    type: "fixed",
    entries: [
      { itemId: ITEM_A, count: 2 },
      { itemId: ITEM_B, count: 1 },
      { itemId: ITEM_C, count: 3 },
    ],
    size: 6,
  };
}

function collectFixed(table: FixedLootTable, seed: number): Map<RegistryId<"item">, number> {
  const collected = new Map<RegistryId<"item">, number>();

  for (let hit = 0; hit < table.size; hit += 1) {
    const result = evaluateLoot(table, seed, hit);
    expect(result.size).toBe(1);

    const onlyEntry = [...result.entries()][0];
    expect(onlyEntry).toBeDefined();
    if (!onlyEntry) throw new Error("Expected one fixed loot result");

    const [itemId, count] = onlyEntry;
    expect(count).toBe(1);
    collected.set(itemId, (collected.get(itemId) ?? 0) + count);
  }

  return collected;
}

describe("evaluateLoot fixed tables", () => {
  test("is deterministic for the same seed and hit", () => {
    const table = fixedTable();

    for (let hit = 0; hit < table.size; hit += 1) {
      expect(entries(evaluateLoot(table, 2468, hit))).toEqual(
        entries(evaluateLoot(table, 2468, hit)),
      );
    }
  });

  test("returns one item per valid hit and exactly preserves the configured multiset", () => {
    expect(entries(collectFixed(fixedTable(), 7))).toEqual([
      [ITEM_A as number, 2],
      [ITEM_B as number, 1],
      [ITEM_C as number, 3],
    ]);
  });

  test("preserves the full multiset for every seed regardless of ordering", () => {
    const expected = entries(collectFixed(fixedTable(), 0));

    for (const seed of [1, 2, 17, 999, -42]) {
      expect(entries(collectFixed(fixedTable(), seed))).toEqual(expected);
    }
  });

  test("returns empty maps for hits outside the fixed range", () => {
    const table = fixedTable();

    for (const hit of [-100, -1, table.size, table.size + 1, 10_000]) {
      expect(evaluateLoot(table, 12, hit).size).toBe(0);
    }
  });
});

describe("evaluateLoot pool tables", () => {
  test("is deterministic for the same seed and hit", () => {
    const table: PoolLootTable = {
      type: "pool",
      pools: [
        {
          rolls: 4,
          entries: [
            { itemId: ITEM_A, count: 1, maxCount: 3, weight: 2 },
            { itemId: ITEM_B, count: 2, maxCount: 5, weight: 5 },
          ],
          totalWeight: 7,
        },
      ],
    };

    for (const hit of [0, 1, 25, 1_000_000]) {
      expect(entries(evaluateLoot(table, 314159, hit))).toEqual(
        entries(evaluateLoot(table, 314159, hit)),
      );
    }
  });

  test("honors every pool's roll count and aggregates repeated item results", () => {
    const table: PoolLootTable = {
      type: "pool",
      pools: [
        {
          rolls: 3,
          entries: [{ itemId: ITEM_A, count: 2, maxCount: 2, weight: 1 }],
          totalWeight: 1,
        },
        {
          rolls: 2,
          entries: [{ itemId: ITEM_A, count: 4, maxCount: 4, weight: 1 }],
          totalWeight: 1,
        },
        {
          rolls: 2,
          entries: [{ itemId: ITEM_B, count: 1, maxCount: 1, weight: 1 }],
          totalWeight: 1,
        },
      ],
    };

    expect(entries(evaluateLoot(table, 88, 0))).toEqual([
      [ITEM_A as number, 14],
      [ITEM_B as number, 2],
    ]);
  });

  test("uses entry weights when selecting roll results", () => {
    const table: PoolLootTable = {
      type: "pool",
      pools: [
        {
          rolls: 1,
          entries: [
            { itemId: ITEM_A, count: 1, maxCount: 1, weight: 1 },
            { itemId: ITEM_B, count: 1, maxCount: 1, weight: 9 },
          ],
          totalWeight: 10,
        },
      ],
    };
    let lightSelections = 0;
    let heavySelections = 0;

    for (let seed = 0; seed < 2_000; seed += 1) {
      const result = evaluateLoot(table, seed, 19);
      expect(result.size).toBe(1);
      lightSelections += result.get(ITEM_A) ?? 0;
      heavySelections += result.get(ITEM_B) ?? 0;
    }

    expect(lightSelections).toBeGreaterThan(0);
    expect(heavySelections).toBeGreaterThan(lightSelections);
  });

  test("produces counts within the inclusive configured range", () => {
    const table: PoolLootTable = {
      type: "pool",
      pools: [
        {
          rolls: 1,
          entries: [{ itemId: ITEM_A, count: 2, maxCount: 4, weight: 1 }],
          totalWeight: 1,
        },
      ],
    };
    const observed = new Set<number>();

    for (let seed = 0; seed < 1_024; seed += 1) {
      const count = evaluateLoot(table, seed, 73).get(ITEM_A);
      expect(count).toBeDefined();
      if (count === undefined) throw new Error("Expected pooled item count");
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
      observed.add(count);
    }

    expect(observed.has(2)).toBe(true);
    expect(observed.has(4)).toBe(true);
  });

  test("does not exhaust pool loot at large or repeated hit numbers", () => {
    const table: PoolLootTable = {
      type: "pool",
      pools: [
        {
          rolls: 2,
          entries: [{ itemId: ITEM_C, count: 3, maxCount: 3, weight: 1 }],
          totalWeight: 1,
        },
      ],
    };

    for (const hit of [0, 1, 10, 10_000, 2_147_483_647]) {
      expect(entries(evaluateLoot(table, 5, hit))).toEqual([[ITEM_C as number, 6]]);
    }
  });
});

describe("evaluateLoot input immutability", () => {
  test("does not mutate fixed or pool table inputs", () => {
    const fixedEntries = Object.freeze([
      Object.freeze({ itemId: ITEM_A, count: 2 }),
      Object.freeze({ itemId: ITEM_B, count: 1 }),
    ]);
    const fixed = Object.freeze({
      type: "fixed" as const,
      entries: fixedEntries,
      size: 3,
    }) satisfies FixedLootTable;

    const poolEntries = Object.freeze([
      Object.freeze({ itemId: ITEM_A, count: 1, maxCount: 3, weight: 2 }),
      Object.freeze({ itemId: ITEM_B, count: 2, maxCount: 2, weight: 1 }),
    ]);
    const pools = Object.freeze([
      Object.freeze({ rolls: 3, entries: poolEntries, totalWeight: 3 }),
    ]);
    const pool = Object.freeze({ type: "pool" as const, pools }) satisfies PoolLootTable;

    const tables: readonly LootTable[] = [fixed, pool];
    for (const table of tables) {
      expect(() => evaluateLoot(table, 123, 1)).not.toThrow();
    }

    expect(fixed).toEqual({
      type: "fixed",
      entries: [
        { itemId: ITEM_A, count: 2 },
        { itemId: ITEM_B, count: 1 },
      ],
      size: 3,
    });
    expect(pool).toEqual({
      type: "pool",
      pools: [
        {
          rolls: 3,
          entries: [
            { itemId: ITEM_A, count: 1, maxCount: 3, weight: 2 },
            { itemId: ITEM_B, count: 2, maxCount: 2, weight: 1 },
          ],
          totalWeight: 3,
        },
      ],
    });
  });
});
