import { idMap, __dirname } from "./id_map.js";
import fs from "fs";
import yaml from "yaml";
import { Component } from "../game_engine/component.js";

type resourceConfigData = {
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
    config.item = data.item || null;
    return new ResourceConfig(config);
}

const _resourceConfigData: { [key: string]: resourceConfigData } = yaml.parse(
    fs.readFileSync(`${__dirname}/resources.yml`, "utf8")
);
export const resourceConfigs: Map<
    number,
    Component<ResourceConfig>
> = new Map();

for (let [k, v] of Object.entries(_resourceConfigData)) {
    const numericId = idMap.get(k);
    const resource = createResourceConfig(numericId, v);
    resourceConfigs.set(numericId, resource);
}
