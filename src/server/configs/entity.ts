import fs from "fs";
import yaml from "yaml";
import { idMap, __dirname } from "./id_map.js";
import { Component } from "../game_engine/component.js";

type entityConfigData = {
    anger: number;
    speed: number;
    attack_damage: number;
    size: number;
    wander_range: number;
    rest_time: number;
};

export type EntityConfig = {
    id: number;
    anger: number;
    speed: number;
    attackDamage: number;
    size: number;
    wanderRange: number;
    restTime: number;
};
export const EntityConfig = Component.register<EntityConfig>();

export function createEntityConfig(
    id: number,
    data: Partial<entityConfigData>
) {
    const config: any = {};
    config.id = id;
    config.wanderRange = data.wander_range || 1000;
    config.anger = data.anger || 1;
    config.speed = data.speed || 1;
    config.attackDamage = data.attack_damage || 0;
    config.size = data.size || 2;
    config.restTime = data.rest_time || 1000;
    return new EntityConfig(config);
}

const _entityConfigData: { [key: string]: entityConfigData } = yaml.parse(
    fs.readFileSync(`${__dirname}/entities.yml`, "utf8")
);
export const entityConfigs: Map<number, Component<EntityConfig>> = new Map();

for (let [k, v] of Object.entries(_entityConfigData)) {
    const numericId = idMap.get(k);
    const entity = createEntityConfig(numericId, v);
    entityConfigs.set(numericId, entity);
}
