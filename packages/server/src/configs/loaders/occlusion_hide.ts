/** Identity fields outsiders may not observe under a roof / ninja gear. */
export type OcclusionHide = {
    full?: boolean;
    name?: boolean;
    skin?: boolean;
    helmet?: boolean;
    mainHand?: boolean;
    offHand?: boolean;
    backpack?: boolean;
    leaderboard?: boolean;
};

const KEYS = [
    "full",
    "name",
    "skin",
    "helmet",
    "mainHand",
    "offHand",
    "backpack",
    "leaderboard",
] as const satisfies readonly (keyof OcclusionHide)[];

const KEY_SET = new Set<string>(KEYS);

/** Parse optional YAML `occlusionHide`; omit / empty → undefined. */
export function parseOcclusionHide(
    raw: unknown,
    path: string
): OcclusionHide | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${path}: expected object`);
    }
    const result: OcclusionHide = {};
    let any = false;
    for (const [key, value] of Object.entries(raw)) {
        if (!KEY_SET.has(key)) {
            throw new Error(`${path}.${key}: unknown key`);
        }
        if (typeof value !== "boolean") {
            throw new Error(`${path}.${key}: expected boolean`);
        }
        if (value) {
            result[key as keyof OcclusionHide] = true;
            any = true;
        }
    }
    return any ? result : undefined;
}

/** OR-merge hide flags from multiple sources. */
export function orOcclusionHide(
    a: OcclusionHide | undefined,
    b: OcclusionHide | undefined
): OcclusionHide | undefined {
    if (!a) return b;
    if (!b) return a;
    const result: OcclusionHide = {};
    let any = false;
    for (const key of KEYS) {
        if (a[key] || b[key]) {
            result[key] = true;
            any = true;
        }
    }
    return any ? result : undefined;
}

/** Any scrub (non-full) that warrants an anon proxy. */
export function hasIdentityHide(hide: OcclusionHide): boolean {
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
export function shouldAnonymize(hide: OcclusionHide | undefined): boolean {
    return !!hide && !hide.full && hasIdentityHide(hide);
}
