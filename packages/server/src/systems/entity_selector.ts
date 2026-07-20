import {
    parseSelector,
    selectorLimit,
    selectorSort,
    type EntitySelector,
} from "@bundu/shared/entity_selector";
import type { RegistryId } from "@bundu/shared/registry";
import { Living, Physics } from "../components/base.js";
import { Flags } from "../components/flags.js";
import { PlayerData } from "../components/player.js";
import {
    resolveMatchClauses,
    type ResolvedMatchClause,
} from "../configs/entity_filter.js";
import type { GameObject } from "../engine";
import type { World } from "../engine/world.js";
import { subjectTypeIds } from "./entity_types.js";

export type { ResolvedMatchClause };

/**
 * Match selector/filter clauses. Repeated positive `type`/`flag`/`name` keys
 * OR together (Minecraft-style); negated keys and different keys AND.
 */
export function subjectMatchesClauses(
    subject: GameObject,
    clauses: readonly ResolvedMatchClause[]
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

    return true;
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
    let found = candidatesForBase(
        options.world,
        selector.base,
        options.executor
    ).filter((obj) => subjectMatchesClauses(obj, matchClauses));

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
