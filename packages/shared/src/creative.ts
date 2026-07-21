/**
 * Creative palette categories — mutually exclusive, priority order:
 * buildings → resources → food → equipment → materials.
 *
 * - buildings: items that place structures
 * - resources: inventory items whose location matches a world resource id
 *   (and future placeable resource items)
 * - food: typed as food
 * - equipment: wear / hold / backpack
 * - materials: crafting ingredients and everything else
 */
export type CreativeCategory =
    | "materials"
    | "equipment"
    | "resources"
    | "buildings"
    | "food";

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
        return "food";
    }
    if (meta.function && EQUIP_FUNCTIONS.has(meta.function)) {
        return "equipment";
    }
    return "materials";
}
