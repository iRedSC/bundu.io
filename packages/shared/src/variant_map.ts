import { ReversableMap } from "./reverseable_map";

const variantMap = new ReversableMap<string, number>();

/** Always reserve `base` at wire id 0 for map YAML / skins / defaults. */
const DEFAULT_MAP: Record<string, number> = { base: 0 };

setVariantMap(DEFAULT_MAP);

/**
 * Replace the live name ↔ id table. Called when resource packs load
 * (server at pack build, client from the models payload).
 */
export function setVariantMap(variants: Record<string, number>): void {
    variantMap.clear();
    for (const [name, id] of Object.entries(variants)) {
        if (typeof id === "number" && Number.isInteger(id) && id >= 0) {
            variantMap.set(name, id);
        }
    }
    if (!variantMap.has("base")) {
        variantMap.set("base", 0);
    }
}

/**
 * Build a stable name → id map from model variant keys.
 * `base` is always id 0; other names are sorted alphabetically.
 */
export function buildVariantMap(
    defs: Iterable<{ variants?: Record<string, unknown> }>
): Record<string, number> {
    const names = new Set<string>(["base"]);
    for (const def of defs) {
        for (const name of Object.keys(def.variants ?? {})) {
            names.add(name);
        }
    }
    const sorted = [...names].sort((a, b) => {
        if (a === "base") return -1;
        if (b === "base") return 1;
        return a.localeCompare(b);
    });
    const map: Record<string, number> = {};
    for (let i = 0; i < sorted.length; i++) {
        const name = sorted[i];
        if (name !== undefined) map[name] = i;
    }
    return map;
}

export function getVariantName(id: number | undefined): string | undefined {
    if (id == null) return undefined;
    const name = variantMap.getv(id);
    if (!name) throw new Error(`Unknown variant id: ${id}`);
    return name;
}

export function getVariantId(name: string | undefined): number | undefined {
    if (name == null) return undefined;
    const id = variantMap.get(name);
    if (id == null) throw new Error(`Unknown variant: ${name}`);
    return id;
}

/** All registered variant names (for editor random-variant mode). */
export function listVariantNames(): readonly string[] {
    return [...variantMap.keys()];
}
