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
] as const satisfies readonly (keyof Hide)[];

const KEY_SET = new Set<string>(KEYS);

/** Parse optional YAML `hide`; omit / empty → undefined. */
export function parseHide(raw: unknown, path: string): Hide | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${path}: expected object`);
    }
    const result: Hide = {};
    let any = false;
    for (const [key, value] of Object.entries(raw)) {
        if (!KEY_SET.has(key)) {
            throw new Error(`${path}.${key}: unknown key`);
        }
        if (typeof value !== "boolean") {
            throw new Error(`${path}.${key}: expected boolean`);
        }
        if (value) {
            result[key as keyof Hide] = true;
            any = true;
        }
    }
    return any ? result : undefined;
}

/** OR-merge hide flags from multiple sources. */
export function orHide(a: Hide | undefined, b: Hide | undefined): Hide | undefined {
    if (!a) return b;
    if (!b) return a;
    const result: Hide = {};
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
