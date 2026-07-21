import type { CreativeSpeed } from "./speeds";

export type CreativeCategory =
    | "materials"
    | "equipment"
    | "resources"
    | "buildings"
    | "food";

export type CreativeState = {
    category: CreativeCategory;
    /** Selected item-registry category tag, or null for all. */
    tagFilter: string | null;
    godmode: boolean;
    speed: CreativeSpeed;
    instakill: boolean;
    /** When true, search matches items across every category. */
    searchAll: boolean;
};

export function createCreativeState(): CreativeState {
    return {
        category: "materials",
        tagFilter: null,
        godmode: false,
        speed: 1,
        instakill: false,
        searchAll: false,
    };
}
