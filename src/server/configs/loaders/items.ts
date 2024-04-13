import { __dirname } from "./id_map.js";
import { Component } from "../../game_engine/component.js";
import { mergeObjects } from "../../../lib/object_utils.js";

export type itemConfigData = {
    type: string;
    attack_damage: number;

    block: number;
    defense: number;

    level: number;
    repair: number;

    eat_heal: number;
    eat_damage: number;
    food: number;

    warmth: number;
    insulation: number;
};

export type ItemConfig = {
    id: number;
    type: string;
    attack_damage: number;

    block: number;
    defense: number;

    level: number;
    repair: number;

    eat_heal: number;
    eat_damage: number;
    food: number;

    warmth: number;
    insulation: number;
};
export const ItemConfig = Component.register<ItemConfig>();

const defaultItemConfig: ItemConfig = {
    id: 0,
    type: "none",
    attack_damage: 0,
    block: 0,
    defense: 0,
    level: 0,
    repair: 0,
    eat_damage: 0,
    eat_heal: 0,
    food: 0,
    warmth: 0,
    insulation: 0,
};

export function createItemConfig(id: number, data: Partial<itemConfigData>) {
    const config = mergeObjects<ItemConfig>(
        undefined,
        { id: id, ...data },
        defaultItemConfig
    );
    return new ItemConfig(config);
}
