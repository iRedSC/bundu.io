import type { CreativeSpeed } from "./speeds";

export type CreativeCategory =
    | "materials"
    | "equipment"
    | "resources"
    | "buildings";

export type CreativeState = {
    category: CreativeCategory;
    godmode: boolean;
    speed: CreativeSpeed;
    instakill: boolean;
};

export function createCreativeState(): CreativeState {
    return {
        category: "materials",
        godmode: false,
        speed: 1,
        instakill: false,
    };
}
