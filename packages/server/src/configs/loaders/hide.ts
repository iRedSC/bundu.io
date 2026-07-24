import {
    parseSelector,
    type SelectorBase,
} from "@bundu/shared/entity_selector";
import type { RegistryId } from "@bundu/shared/registry";
import {
    resolveEntityFilterClauses,
    type ResolvedMatchClause,
} from "../entity_filter.js";
import { flagRegistry } from "../flag_registry.js";

/** Who should see the subject's model as semi-transparent. */
export type VisualEffect = "none" | "self" | "exclusions";

/**
 * Parsed exclusion selector (same shape as effect-target matchers).
 * Only meaningful on unmerged hide payloads — never OR-merged.
 */
export type HideExclusionTarget = {
    all: boolean;
    base?: SelectorBase;
    types: ReadonlySet<RegistryId<"entity_type">>;
    clauses: readonly ResolvedMatchClause[];
};

/** Identity fields outsiders may not observe (roof, gear, etc.). */
export type Hide = {
    full?: boolean;
    name?: boolean;
    skin?: boolean;
    helmet?: boolean;
    mainHand?: boolean;
    offHand?: boolean;
    backpack?: boolean;
    leaderboard?: boolean;
    /** Widest-wins when OR-merged: exclusions > self > none. */
    visualEffect?: VisualEffect;
    /**
     * Who is excluded from this hide (hide does not apply to them). With
     * `visualEffect: exclusions`, those entities see the ghost model.
     * Kept per-source; stripped by {@link orHide}.
     */
    exclusionTarget?: HideExclusionTarget;
};

const BOOL_KEYS = [
    "full",
    "name",
    "skin",
    "helmet",
    "mainHand",
    "offHand",
    "backpack",
    "leaderboard",
] as const satisfies readonly (keyof Hide)[];

const BOOL_KEY_SET = new Set<string>(BOOL_KEYS);

const VISUAL_EFFECTS = new Set<VisualEffect>(["none", "self", "exclusions"]);

const VISUAL_RANK: Record<VisualEffect, number> = {
    none: 0,
    self: 1,
    exclusions: 2,
};

function parseExclusionTarget(
    raw: unknown,
    path: string,
    ownerId: string
): HideExclusionTarget {
    if (typeof raw !== "string" || raw.length === 0) {
        throw new Error(`${path}: expected selector string`);
    }
    if (raw === "*") {
        return { all: true, types: new Set(), clauses: [] };
    }
    if (!raw.startsWith("@")) {
        throw new Error(
            `${path}: expected entity selector (e.g. "@a[distance=..3]")`
        );
    }
    const parsed = parseSelector(raw);
    if (!parsed.ok) {
        throw new Error(`${path}: ${parsed.message}`);
    }
    for (const clause of parsed.value.clauses) {
        if (clause.key === "limit" || clause.key === "sort") {
            throw new Error(
                `${path}: ${clause.key} is not valid in hide exclusion selectors`
            );
        }
    }
    for (const clause of parsed.value.clauses) {
        if (clause.key === "flag" && clause.value !== undefined) {
            flagRegistry().register(clause.value, path);
        }
    }
    const clauses = resolveEntityFilterClauses(
        parsed.value.clauses,
        ownerId,
        path
    );
    return {
        all: false,
        base: parsed.value.base,
        types: new Set(),
        clauses,
    };
}

/** Parse optional YAML `hide`; omit / empty → undefined. */
export function parseHide(
    raw: unknown,
    path: string,
    ownerId: string
): Hide | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${path}: expected object`);
    }
    const result: Hide = {};
    let any = false;
    for (const [key, value] of Object.entries(raw)) {
        if (key === "visualEffect") {
            if (typeof value !== "string" || !VISUAL_EFFECTS.has(value as VisualEffect)) {
                throw new Error(
                    `${path}.visualEffect: expected none|self|exclusions`
                );
            }
            if (value !== "none") {
                result.visualEffect = value as VisualEffect;
                any = true;
            }
            continue;
        }
        if (key === "exclusionTarget") {
            result.exclusionTarget = parseExclusionTarget(
                value,
                `${path}.exclusionTarget`,
                ownerId
            );
            any = true;
            continue;
        }
        if (!BOOL_KEY_SET.has(key)) {
            throw new Error(`${path}.${key}: unknown key`);
        }
        if (typeof value !== "boolean") {
            throw new Error(`${path}.${key}: expected boolean`);
        }
        if (value) {
            result[key as (typeof BOOL_KEYS)[number]] = true;
            any = true;
        }
    }
    if (result.exclusionTarget && result.visualEffect !== "exclusions") {
        throw new Error(
            `${path}.exclusionTarget: only valid when visualEffect is "exclusions"`
        );
    }
    return any ? result : undefined;
}

/** Wider visual effect wins: exclusions > self > none. */
export function widerVisualEffect(
    a: VisualEffect | undefined,
    b: VisualEffect | undefined
): VisualEffect | undefined {
    const left = a ?? "none";
    const right = b ?? "none";
    const widest =
        VISUAL_RANK[left] >= VISUAL_RANK[right] ? left : right;
    return widest === "none" ? undefined : widest;
}

/** OR-merge hide flags from multiple sources. */
export function orHide(a: Hide | undefined, b: Hide | undefined): Hide | undefined {
    if (!a) return b ? stripExclusionTarget(b) : undefined;
    if (!b) return stripExclusionTarget(a);
    const result: Hide = {};
    let any = false;
    for (const key of BOOL_KEYS) {
        if (a[key] || b[key]) {
            result[key] = true;
            any = true;
        }
    }
    const visual = widerVisualEffect(a.visualEffect, b.visualEffect);
    if (visual) {
        result.visualEffect = visual;
        any = true;
    }
    // exclusionTarget is per-source — never merge.
    return any ? result : undefined;
}

function stripExclusionTarget(hide: Hide): Hide {
    if (!hide.exclusionTarget) return hide;
    const { exclusionTarget: _, ...rest } = hide;
    return rest;
}

/** Any scrub (non-full) that warrants an anon proxy. */
export function hasIdentityHide(hide: Hide): boolean {
    return !!(
        hide.name ||
        hide.skin ||
        hide.helmet ||
        hide.mainHand ||
        hide.offHand ||
        hide.backpack
    );
}

/** True when outsiders should see a proxy instead of the real player. */
export function shouldAnonymize(hide: Hide | undefined): boolean {
    return !!hide && !hide.full && hasIdentityHide(hide);
}

/** A single hide payload that contributes a visual effect. */
export type VisualHideSource = {
    visualEffect: Exclude<VisualEffect, "none">;
    /** Audience for `exclusions` mode: viewers matching this see the ghost. */
    exclusionTarget?: HideExclusionTarget;
};
