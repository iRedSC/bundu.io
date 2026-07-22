import type { DistanceRange, SelectorClause } from "@bundu/shared/entity_selector";
import type { RegistryId } from "@bundu/shared/registry";
import {
    isTimeOfDayName,
    type TimeOfDayName,
} from "../network/day_cycle.js";
import { flagRegistry } from "./flag_registry.js";
import { gameRegistries } from "./registries.js";

export type ResolvedTypeClause = {
    key: "type";
    negate: boolean;
    ids: ReadonlySet<RegistryId<"entity_type">>;
};

export type ResolvedFlagClause = {
    key: "flag";
    negate: boolean;
    id: number;
};

export type ResolvedNameClause = {
    key: "name";
    negate: boolean;
    value: string;
};

export type ResolvedItemClause = {
    key: "mainhand" | "offhand" | "helmet" | "hasitem";
    negate: boolean;
    ids: ReadonlySet<RegistryId<"item">>;
};

export type ResolvedGroundClause = {
    key: "ground";
    negate: boolean;
    ids: ReadonlySet<RegistryId<"ground_type">>;
};

export type ResolvedTimeClause = {
    key: "time";
    negate: boolean;
    value: TimeOfDayName;
};

export type ResolvedDistanceClause = {
    key: "distance";
    negate: boolean;
    range: DistanceRange;
};

export type ResolvedConnectedClause = {
    key: "connected";
    negate: boolean;
    value: boolean;
};

/** Clauses that can be matched against a single subject (no limit/sort). */
export type ResolvedMatchClause =
    | ResolvedTypeClause
    | ResolvedFlagClause
    | ResolvedNameClause
    | ResolvedItemClause
    | ResolvedGroundClause
    | ResolvedTimeClause
    | ResolvedDistanceClause
    | ResolvedConnectedClause;

function namespaceOf(ownerId: string): string {
    const sep = ownerId.indexOf(":");
    return sep >= 0 ? ownerId.slice(0, sep) : "bundu";
}

function resolveTypeValue(
    value: string,
    defaultNamespace: string | undefined,
    path: string
): Set<RegistryId<"entity_type">> {
    return new Set(
        gameRegistries().entity_type.resolveSet([value], defaultNamespace, path)
    );
}

function resolveItemValue(
    value: string,
    defaultNamespace: string | undefined,
    path: string
): Set<RegistryId<"item">> {
    return new Set(
        gameRegistries().item.resolveSet([value], defaultNamespace, path)
    );
}

function resolveGroundValue(
    value: string,
    defaultNamespace: string | undefined,
    path: string
): Set<RegistryId<"ground_type">> {
    return new Set(
        gameRegistries().ground_type.resolveSet([value], defaultNamespace, path)
    );
}

/** Resolve match clauses from a parsed selector/filter for runtime checks. */
export function resolveMatchClauses(
    clauses: readonly SelectorClause[],
    defaultNamespace: string | undefined,
    path: string
): ResolvedMatchClause[] {
    const out: ResolvedMatchClause[] = [];
    for (const clause of clauses) {
        if (clause.key === "limit" || clause.key === "sort") continue;
        if (clause.key === "type") {
            out.push({
                key: "type",
                negate: clause.negate,
                ids: resolveTypeValue(clause.value, defaultNamespace, path),
            });
            continue;
        }
        if (clause.key === "flag") {
            const id = flagRegistry().resolve(clause.value, path);
            out.push({ key: "flag", negate: clause.negate, id });
            continue;
        }
        if (clause.key === "name") {
            out.push({
                key: "name",
                negate: clause.negate,
                value: clause.value,
            });
            continue;
        }
        if (
            clause.key === "mainhand" ||
            clause.key === "offhand" ||
            clause.key === "helmet" ||
            clause.key === "hasitem"
        ) {
            out.push({
                key: clause.key,
                negate: clause.negate,
                ids: resolveItemValue(clause.value, defaultNamespace, path),
            });
            continue;
        }
        if (clause.key === "ground") {
            out.push({
                key: "ground",
                negate: clause.negate,
                ids: resolveGroundValue(clause.value, defaultNamespace, path),
            });
            continue;
        }
        if (clause.key === "time") {
            if (!isTimeOfDayName(clause.value)) {
                throw new Error(
                    `${path}: time must be morning|day|evening|night (got "${clause.value}")`
                );
            }
            out.push({
                key: "time",
                negate: clause.negate,
                value: clause.value,
            });
            continue;
        }
        if (clause.key === "distance") {
            out.push({
                key: "distance",
                negate: clause.negate,
                range: clause.range,
            });
            continue;
        }
        if (clause.key === "connected") {
            out.push({
                key: "connected",
                negate: clause.negate,
                value: clause.value,
            });
        }
    }
    return out;
}

export function resolveEntityFilterClauses(
    clauses: readonly SelectorClause[],
    ownerId: string,
    path: string
): ResolvedMatchClause[] {
    return resolveMatchClauses(clauses, namespaceOf(ownerId), path);
}

/** Upper bound in tiles for scanning emanating equip selectors; undefined if unbounded. */
export function distanceClauseMaxTiles(
    clauses: readonly ResolvedMatchClause[]
): number | undefined {
    for (const clause of clauses) {
        if (clause.key !== "distance") continue;
        if (!Number.isFinite(clause.range.max)) return undefined;
        return clause.range.max;
    }
    return undefined;
}
