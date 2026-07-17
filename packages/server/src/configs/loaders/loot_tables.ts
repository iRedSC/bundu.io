import type { RegistryId } from "@bundu/shared/registry";
import type { SourcedRecord } from "../packs.js";
import { gameRegistries } from "../registries.js";

export type LootStack = {
    itemId: RegistryId<"item">;
    count: number;
};

export type FixedLootTable = {
    type: "fixed";
    entries: readonly LootStack[];
    size: number;
};

export type PoolEntry = LootStack & {
    weight: number;
    maxCount: number;
};

export type PoolLootTable = {
    type: "pool";
    pools: readonly {
        rolls: number;
        entries: readonly PoolEntry[];
        totalWeight: number;
    }[];
};

export type LootTable = FixedLootTable | PoolLootTable;

export const LootTables = new Map<RegistryId<"loot_table">, LootTable>();

function object(value: unknown, source: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, source: string, fallback?: number): number {
    if (value === undefined && fallback !== undefined) return fallback;
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        throw new Error(`${source}: expected a positive integer`);
    }
    return value as number;
}

function entries(
    value: unknown,
    namespace: string,
    source: string,
    pooled: boolean
): (LootStack | PoolEntry)[] {
    if (!Array.isArray(value)) throw new Error(`${source}: expected an array`);
    const registry = gameRegistries().item;
    return value.map((raw, index) => {
        const path = `${source}[${index}]`;
        const entry = object(raw, path);
        if (typeof entry.item !== "string") {
            throw new Error(`${path}.item: expected a string`);
        }
        const count = entry.count;
        let min = 1;
        let max = 1;
        if (typeof count === "object" && count !== null) {
            const range = object(count, `${path}.count`);
            min = positiveInteger(range.min, `${path}.count.min`);
            max = positiveInteger(range.max, `${path}.count.max`);
            if (max < min) throw new Error(`${path}.count.max: expected >= min`);
        } else {
            min = max = positiveInteger(count, `${path}.count`, 1);
        }
        const stack: LootStack = {
            itemId: registry.resolve(entry.item, namespace, `${path}.item`),
            count: min,
        };
        if (!pooled) {
            if (min !== max) throw new Error(`${path}.count: fixed entries require one count`);
            return stack;
        }
        return {
            ...stack,
            maxCount: max,
            weight: positiveInteger(entry.weight, `${path}.weight`, 1),
        };
    });
}

export function loadLootTables(
    sources: ReadonlyMap<string, SourcedRecord>
): void {
    const registry = gameRegistries().loot_table;
    LootTables.clear();
    for (const [location, source] of sources) {
        const data = object(source.value, source.source);
        const id = registry.id(location as `${string}:${string}`, source.source);
        if (data.type === "fixed") {
            const fixedEntries = entries(
                data.entries,
                source.namespace,
                `${source.source}.entries`,
                false
            ) as LootStack[];
            LootTables.set(id, {
                type: "fixed",
                entries: fixedEntries,
                size: fixedEntries.reduce((total, entry) => total + entry.count, 0),
            });
            continue;
        }
        if (data.type !== "pool") {
            throw new Error(`${source.source}.type: expected "fixed" or "pool"`);
        }
        if (!Array.isArray(data.pools)) {
            throw new Error(`${source.source}.pools: expected an array`);
        }
        const pools = data.pools.map((raw, index) => {
            const path = `${source.source}.pools[${index}]`;
            const pool = object(raw, path);
            const poolEntries = entries(
                pool.entries,
                source.namespace,
                `${path}.entries`,
                true
            ) as PoolEntry[];
            if (poolEntries.length === 0) {
                throw new Error(`${path}.entries: expected at least one entry`);
            }
            return {
                rolls: positiveInteger(pool.rolls, `${path}.rolls`, 1),
                entries: poolEntries,
                totalWeight: poolEntries.reduce(
                    (total, entry) => total + entry.weight,
                    0
                ),
            };
        });
        LootTables.set(id, { type: "pool", pools });
    }
}

function randomUnit(seed: number, hit: number, salt: number): number {
    let value =
        (seed | 0) ^ Math.imul((hit + 1) | 0, 0x9e3779b1) ^
        Math.imul((salt + 1) | 0, 0x85ebca6b);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x1_0000_0000;
}

function greatestCommonDivisor(left: number, right: number): number {
    while (right !== 0) [left, right] = [right, left % right];
    return left;
}

function fixedIndex(seed: number, hit: number, size: number): number | undefined {
    if (hit < 0 || hit >= size || size === 0) return undefined;
    const offset = Math.floor(randomUnit(seed, 0, 0) * size);
    let step = Math.max(1, Math.floor(randomUnit(seed, 0, 1) * size));
    while (greatestCommonDivisor(step, size) !== 1) step++;
    return (offset + hit * step) % size;
}

function add(result: Map<RegistryId<"item">, number>, stack: LootStack): void {
    result.set(stack.itemId, (result.get(stack.itemId) ?? 0) + stack.count);
}

export function evaluateLoot(
    table: LootTable,
    seed: number,
    hit: number
): ReadonlyMap<RegistryId<"item">, number> {
    const result = new Map<RegistryId<"item">, number>();
    if (table.type === "fixed") {
        let index = fixedIndex(seed, hit, table.size);
        if (index === undefined) return result;
        for (const entry of table.entries) {
            if (index < entry.count) {
                add(result, { itemId: entry.itemId, count: 1 });
                return result;
            }
            index -= entry.count;
        }
        return result;
    }

    let salt = 0;
    for (const pool of table.pools) {
        for (let roll = 0; roll < pool.rolls; roll++) {
            let selected = randomUnit(seed, hit, salt++) * pool.totalWeight;
            const fallback = pool.entries.at(-1);
            if (!fallback) throw new Error("Loot pool has no entries");
            const entry =
                pool.entries.find((candidate) => {
                    selected -= candidate.weight;
                    return selected < 0;
                }) ?? fallback;
            const count =
                entry.count +
                Math.floor(
                    randomUnit(seed, hit, salt++) *
                        (entry.maxCount - entry.count + 1)
                );
            add(result, { itemId: entry.itemId, count });
        }
    }
    return result;
}

export function evaluateLootTable(
    tableId: RegistryId<"loot_table">,
    seed: number,
    hit: number
): ReadonlyMap<RegistryId<"item">, number> {
    const table = LootTables.get(tableId);
    if (!table) throw new Error(`Unknown loot table id ${tableId}`);
    return evaluateLoot(table, seed, hit);
}
