import yaml from "yaml";
import fs from "fs";
import { idMap, __dirname } from "./id_map.js";
import { Component } from "../game_engine/component.js";

export type itemConfigData = {
    type: string;
    attack_damage: number;
    defense: number;
    mining_level: number;
};

export type ItemConfig = {
    id: number;
    type: string;
    attackDamage: number;
    defense: number;
    level: number;
};
export const ItemConfig = Component.register<ItemConfig>();

export function createItemConfig(id: number, data: Partial<itemConfigData>) {
    const config: any = {};
    config.id = id;
    config.type = data.type || "none";
    config.attackDamage = data.attack_damage || 0;
    config.defense = data.defense || 0;
    config.level = data.mining_level || 0;
    return new ItemConfig(config);
}
