import { idMap } from "./id_map.js";

import { Component } from "../game_engine/component.js";

export type resourceConfigData = {
    level: number;
    regenSpeed: number;
    amount: number;
    item: number;
};

export type ResourceConfig = {
    id: number;
    level: number;
    regenSpeed: number;
    amount: number;
    item: number | undefined;
};
export const ResourceConfig = Component.register<ResourceConfig>();

export function createResourceConfig(
    id: number,
    data: Partial<resourceConfigData>
) {
    const config: any = {};
    config.id = id;
    config.level = data.level || 0;
    config.regenSpeed = data.regenSpeed || 10;
    config.amount = data.amount || 5;
    config.item = idMap.get(data.item) || -1;
    return new ResourceConfig(config);
}
