import {
    parseSelector,
    selectorLimit,
    selectorSort,
    type EntitySelector,
    type SelectorBase,
} from "@bundu/shared/entity_selector";
import type { RegistryId } from "@bundu/shared/registry";
import { TILE_SIZE, worldToTile } from "@bundu/shared/tiles";
import { Living, Physics } from "../components/base.js";
import { Flags } from "../components/flags.js";
import { Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import {
    resolveMatchClauses,
    type ResolvedItemClause,
    type ResolvedMatchClause,
} from "../configs/entity_filter.js";
import type { GameObject } from "../engine";
import type { World } from "../engine/world.js";
import { topGroundAt } from "./ground_at.js";
import { subjectTypeIds } from "./entity_types.js";

export type { ResolvedMatchClause };

export type MatchContext = {
    world?: World;
    /** Selector executor / effect source (for `@s` and `distance=`). */
    executor?: GameObject;
};

function inventoryHasAny(
    subject: GameObject,
    ids: ReadonlySet<RegistryId<"item">>
): boolean {
    const inv = Inventory.get(subject);
    if (!inv) return false;
    for (const stack of inv.slots) {
        if (stack && ids.has(stack.id as RegistryId<"item">)) return true;
    }
    return false;
}

function equippedId(
    subject: GameObject,
    slot: "mainHand" | "offHand" | "helmet"
): number | undefined {
    return PlayerData.get(subject)?.[slot];
}

function itemClauses(
    clauses: readonly ResolvedMatchClause[],
    key: ResolvedItemClause["key"]
): ResolvedItemClause[] {
    return clauses.filter((c): c is ResolvedItemClause => c.key === key);
}

function matchItemSlot(
    clauses: readonly ResolvedMatchClause[],
    key: "mainhand" | "offhand" | "helmet",
    equipped: number | undefined
): boolean {
    const group = itemClauses(clauses, key);
    if (group.length === 0) return true;
    const positive = group.filter((c) => !c.negate);
    const negative = group.filter((c) => c.negate);
    if (positive.length > 0) {
        if (
            equipped === undefined ||
            !positive.some((c) => c.ids.has(equipped as RegistryId<"item">))
        ) {
            return false;
        }
    }
    if (equipped !== undefined) {
        for (const c of negative) {
            if (c.ids.has(equipped as RegistryId<"item">)) return false;
        }
    }
    return true;
}

function tileDistance(a: GameObject, b: GameObject): number | undefined {
    const pa = Physics.get(a)?.position;
    const pb = Physics.get(b)?.position;
    if (!pa || !pb) return undefined;
    const dx = pa.x - pb.x;
    const dy = pa.y - pb.y;
    return Math.hypot(dx, dy) / TILE_SIZE;
}

/**
 * Match selector/filter clauses. Repeated positive same-key clauses OR
 * together (Minecraft-style); negated keys and different keys AND.
 */
export function subjectMatchesClauses(
    subject: GameObject,
    clauses: readonly ResolvedMatchClause[],
    ctx: MatchContext = {}
): boolean {
    const types = clauses.filter((c) => c.key === "type");
    if (types.length > 0) {
        const ids = subjectTypeIds(subject);
        const positive = types.filter((c) => !c.negate);
        const negative = types.filter((c) => c.negate);
        if (
            positive.length > 0 &&
            !positive.some((c) =>
                ids.some((id) => c.ids.has(id as RegistryId<"entity_type">))
            )
        ) {
            return false;
        }
        for (const c of negative) {
            if (ids.some((id) => c.ids.has(id as RegistryId<"entity_type">))) {
                return false;
            }
        }
    }

    const flags = clauses.filter((c) => c.key === "flag");
    if (flags.length > 0) {
        const subjectFlags = Flags.get(subject);
        const positive = flags.filter((c) => !c.negate);
        const negative = flags.filter((c) => c.negate);
        if (
            positive.length > 0 &&
            !positive.some((c) => !!subjectFlags?.has(c.id))
        ) {
            return false;
        }
        for (const c of negative) {
            if (subjectFlags?.has(c.id)) return false;
        }
    }

    const names = clauses.filter((c) => c.key === "name");
    if (names.length > 0) {
        const name = PlayerData.get(subject)?.name;
        const positive = names.filter((c) => !c.negate);
        const negative = names.filter((c) => c.negate);
        if (
            positive.length > 0 &&
            !positive.some((c) => name !== undefined && name === c.value)
        ) {
            return false;
        }
        for (const c of negative) {
            if (name !== undefined && name === c.value) return false;
        }
    }

    if (
        !matchItemSlot(clauses, "mainhand", equippedId(subject, "mainHand")) ||
        !matchItemSlot(clauses, "offhand", equippedId(subject, "offHand")) ||
        !matchItemSlot(clauses, "helmet", equippedId(subject, "helmet"))
    ) {
        return false;
    }

    const hasItems = itemClauses(clauses, "hasitem");
    if (hasItems.length > 0) {
        const positive = hasItems.filter((c) => !c.negate);
        const negative = hasItems.filter((c) => c.negate);
        if (
            positive.length > 0 &&
            !positive.some((c) => inventoryHasAny(subject, c.ids))
        ) {
            return false;
        }
        for (const c of negative) {
            if (inventoryHasAny(subject, c.ids)) return false;
        }
    }

    const grounds = clauses.filter((c) => c.key === "ground");
    if (grounds.length > 0) {
        const physics = Physics.get(subject);
        const world = ctx.world;
        if (!physics || !world) return false;
        const top = topGroundAt(
            world,
            worldToTile(physics.position.x),
            worldToTile(physics.position.y)
        );
        const present = top !== undefined;
        const positive = grounds.filter((c) => !c.negate);
        const negative = grounds.filter((c) => c.negate);
        if (
            positive.length > 0 &&
            (!present ||
                !positive.some((c) =>
                    c.ids.has(top.type as RegistryId<"ground_type">)
                ))
        ) {
            return false;
        }
        if (present) {
            for (const c of negative) {
                if (c.ids.has(top.type as RegistryId<"ground_type">)) {
                    return false;
                }
            }
        }
    }

    const times = clauses.filter((c) => c.key === "time");
    if (times.length > 0) {
        const world = ctx.world;
        if (!world) return false;
        const current = world.context.dayCycle.periodName;
        const positive = times.filter((c) => !c.negate);
        const negative = times.filter((c) => c.negate);
        if (
            positive.length > 0 &&
            !positive.some((c) => c.value === current)
        ) {
            return false;
        }
        for (const c of negative) {
            if (c.value === current) return false;
        }
    }

    const distances = clauses.filter((c) => c.key === "distance");
    if (distances.length > 0) {
        const executor = ctx.executor;
        if (!executor) return false;
        const dist = tileDistance(subject, executor);
        if (dist === undefined) return false;
        const inRange = (range: {
            min: number;
            max: number;
        }): boolean => dist >= range.min && dist <= range.max;
        const positive = distances.filter((c) => !c.negate);
        const negative = distances.filter((c) => c.negate);
        if (positive.length > 0 && !positive.some((c) => inRange(c.range))) {
            return false;
        }
        for (const c of negative) {
            if (inRange(c.range)) return false;
        }
    }

    const connected = clauses.filter((c) => c.key === "connected");
    if (connected.length > 0) {
        const world = ctx.world;
        if (!world) return false;
        const isConnected =
            world.context.socketManager.getSocket(subject.id) !== undefined;
        for (const c of connected) {
            const hit = isConnected === c.value;
            if (hit === c.negate) return false;
        }
    }

    return true;
}

export function subjectMatchesBase(
    subject: GameObject,
    base: SelectorBase,
    executor: GameObject | undefined
): boolean {
    switch (base) {
        case "s":
            return executor !== undefined && subject === executor;
        case "a":
        case "p":
        case "r":
            return PlayerData.get(subject) !== undefined;
        case "e":
            return Living.get(subject) !== undefined;
    }
}

function candidatesForBase(
    world: World,
    base: EntitySelector["base"],
    executor: GameObject
): GameObject[] {
    switch (base) {
        case "s":
            return [executor];
        case "a":
        case "p":
        case "r":
            // All player bodies (including soft-disconnected). Use
            // `connected=true` to restrict to socket-connected players.
            return world.query([PlayerData]);
        case "e":
            return world.query([Living]);
    }
}

function squaredDistance(a: GameObject, b: GameObject): number {
    const pa = Physics.get(a)?.position;
    const pb = Physics.get(b)?.position;
    if (!pa || !pb) return Number.POSITIVE_INFINITY;
    const dx = pa.x - pb.x;
    const dy = pa.y - pb.y;
    return dx * dx + dy * dy;
}

function shuffleInPlace<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const a = items[i];
        const b = items[j];
        if (a === undefined || b === undefined) continue;
        items[i] = b;
        items[j] = a;
    }
}

export type ResolveSelectorOptions = {
    world: World;
    executor: GameObject;
    /**
     * Namespace for bare type ids. Commands omit this so `type=` must be
     * `namespace:path` (or `#namespace:path`). Pack loaders pass an owner ns.
     */
    defaultNamespace?: string;
};

/**
 * Resolve a command selector string to matching entities.
 * Throws on parse/resolve errors; returns [] when nothing matches.
 */
export function resolveSelector(
    raw: string,
    options: ResolveSelectorOptions
): GameObject[] {
    const parsed = parseSelector(raw);
    if (!parsed.ok) throw new Error(parsed.message);
    return resolveParsedSelector(parsed.value, options);
}

export function resolveParsedSelector(
    selector: EntitySelector,
    options: ResolveSelectorOptions
): GameObject[] {
    const matchClauses = resolveMatchClauses(
        selector.clauses,
        options.defaultNamespace,
        selector.raw
    );
    const matchCtx: MatchContext = {
        world: options.world,
        executor: options.executor,
    };
    let found = candidatesForBase(
        options.world,
        selector.base,
        options.executor
    ).filter((obj) => subjectMatchesClauses(obj, matchClauses, matchCtx));

    const sort = selectorSort(selector);
    if (sort === "nearest" || sort === "furthest") {
        found.sort((a, b) => {
            const da = squaredDistance(a, options.executor);
            const db = squaredDistance(b, options.executor);
            return sort === "nearest" ? da - db : db - da;
        });
    } else if (sort === "random") {
        shuffleInPlace(found);
    }

    // @p defaults to one nearest player; @r defaults to one random player.
    let limit = selectorLimit(selector);
    if (limit === undefined && (selector.base === "p" || selector.base === "r")) {
        limit = 1;
    }
    if (limit !== undefined) found = found.slice(0, limit);
    return found;
}
