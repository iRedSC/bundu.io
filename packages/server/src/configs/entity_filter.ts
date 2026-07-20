import type { SelectorClause } from "@bundu/shared/entity_selector";
import type { RegistryId } from "@bundu/shared/registry";
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

/** Clauses that can be matched against a single subject (no limit/sort). */
export type ResolvedMatchClause =
    | ResolvedTypeClause
    | ResolvedFlagClause
    | ResolvedNameClause;

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
        out.push({
            key: "name",
            negate: clause.negate,
            value: clause.value,
        });
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
