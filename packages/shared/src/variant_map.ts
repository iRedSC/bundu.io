import variants from "./variant_map.yml";
import { ReversableMap } from "./reverseable_map";

const variantMap = new ReversableMap<string, number>();

for (const [name, id] of Object.entries(variants)) {
    if (typeof id === "number") variantMap.set(name, id);
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
