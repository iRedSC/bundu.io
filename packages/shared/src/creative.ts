/**
 * Creative palette categories — mutually exclusive, priority order:
 * buildings → resources → equipment → materials.
 *
 * - buildings: items that place structures
 * - resources: inventory items whose location matches a world resource id
 *   (ore/stone-style harvest drops)
 * - equipment: wear / hold / backpack (food typed items stay materials)
 * - materials: crafting ingredients, food, and everything else
 */
export type CreativeCategory =
    | "materials"
    | "equipment"
    | "resources"
    | "buildings";

export type CreativeItemMeta = {
    function: string | null;
    type: string | null;
    places: number | null;
};

const EQUIP_FUNCTIONS = new Set([
    "main_hand",
    "off_hand",
    "wear",
    "backpack",
]);

export function creativeCategoryFor(
    location: string,
    meta: CreativeItemMeta,
    resourceLocations: ReadonlySet<string>
): CreativeCategory {
    if (meta.places !== null || meta.function === "building") {
        return "buildings";
    }
    if (resourceLocations.has(location)) {
        return "resources";
    }
    const typeName = meta.type?.includes(":")
        ? meta.type.slice(meta.type.indexOf(":") + 1)
        : meta.type;
    if (typeName === "food") {
        return "materials";
    }
    if (meta.function && EQUIP_FUNCTIONS.has(meta.function)) {
        return "equipment";
    }
    return "materials";
}
