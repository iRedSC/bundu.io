import type { RegistryId } from "@bundu/shared/registry";
import type { TargetEffect } from "../configs/loaders/effect_context.js";
import type { GameObject } from "../engine";
import { subjectMatchesClauses } from "./entity_selector.js";
import { playerEntityTypeId, subjectTypeIds } from "./entity_types.js";

export { playerEntityTypeId, subjectTypeIds };

export function subjectMatchesTarget(
    subject: GameObject,
    target: TargetEffect
): boolean {
    if (target.all) return true;

    // Compound filters (`type=…,flag=…`) — all clauses must match.
    if (target.clauses.length > 0) {
        return subjectMatchesClauses(subject, target.clauses);
    }

    // Bare type / #tag keys.
    const ids = subjectTypeIds(subject);
    if (ids.length === 0) return false;
    for (const id of ids) {
        if (target.types.has(id as RegistryId<"entity_type">)) return true;
    }
    return false;
}
