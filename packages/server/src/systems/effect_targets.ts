import type { RegistryId } from "@bundu/shared/registry";
import type {
    EffectTargetMatch,
    TargetEffect,
} from "../configs/loaders/effect_context.js";
import type { GameObject } from "../engine";
import {
    subjectMatchesBase,
    subjectMatchesClauses,
    type MatchContext,
} from "./entity_selector.js";
import { playerEntityTypeId, subjectTypeIds } from "./entity_types.js";

export { playerEntityTypeId, subjectTypeIds };
export type { MatchContext };

export function subjectMatchesTarget(
    subject: GameObject,
    target: EffectTargetMatch,
    ctx: MatchContext = {}
): boolean {
    if (target.all) return true;

    if (target.base !== undefined) {
        if (!subjectMatchesBase(subject, target.base, ctx.executor)) {
            return false;
        }
        if (target.clauses.length === 0) return true;
        return subjectMatchesClauses(subject, target.clauses, ctx);
    }

    // Compound filters (`type=…,flag=…`); same-key positives OR, else AND.
    if (target.clauses.length > 0) {
        return subjectMatchesClauses(subject, target.clauses, ctx);
    }

    // Bare type / #tag keys.
    const ids = subjectTypeIds(subject);
    if (ids.length === 0) return false;
    for (const id of ids) {
        if (target.types.has(id as RegistryId<"entity_type">)) return true;
    }
    return false;
}

/** True when this target can match someone other than the executor. */
export function targetCanAffectOthers(target: TargetEffect): boolean {
    if (target.all) return true;
    if (target.base === undefined) return target.clauses.length > 0 || target.types.size > 0;
    return target.base !== "s";
}
