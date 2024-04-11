import { idMap } from "./id_map.js";

import { Component } from "../../game_engine/component.js";
import Logger from "js-logger";

export type resourceConfigData = {
    destroy_on_empty: boolean;
    score: number;
    level: number;
    exclusive: boolean;
    multipliers: { [key: string]: number };
    decay: number;
    regenSpeed: number;
    items: { [key: string]: number };
};

export type ResourceConfig = {
    id: number;
    score: number;
    decay: number;
    exclusive: boolean;
    level: number;
    destroy_on_empty: boolean;
    regenSpeed: number;
    multipliers: Map<string, number>;
    items: Map<number, number>;
};
export const ResourceConfig = Component.register<ResourceConfig>();

export function createResourceConfig(
    id: number,
    data: Partial<resourceConfigData>
) {
    const config: any = {};
    config.id = id;
    config.score = data.score || 0;
    config.destroyOnEmpty = data.destroy_on_empty || false;
    config.exclusive = data.exclusive || false;
    config.decay = data.decay || 0;
    config.level = data.level || 0;
    config.regenSpeed = data.regenSpeed || 10;
    config.multipliers = new Map();
    for (const [name, amount] of Object.entries(data.multipliers || {})) {
        config.multipliers.set(name, amount);
    }
    config.items = new Map();
    for (const [name, amount] of Object.entries(data.items || {})) {
        const id = idMap.get(name);
        if (!id) {
            Logger.error(`Item name ${name} couldn't be found in ID map.`);
            continue;
        }
        config.items.set(id, amount);
    }
    return new ResourceConfig(config);
}
