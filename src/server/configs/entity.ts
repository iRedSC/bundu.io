import fs from "fs";
import yaml from "yaml";
import { idMap, __dirname } from "./id_map.js";

type entityConfigData = {
    anger: number;
    speed: number;
    attack_damage: number;
    size: number;
    wander_range: number;
    rest_time: number;
};

export class EntityConfig {
    id: number;
    anger: number;
    speed: number;
    attackDamage: number;
    size: number;
    wanderRange: number;
    restTime: number;

    constructor(id: number, data: Partial<entityConfigData>) {
        this.id = id;
        this.wanderRange = data.wander_range || 1000;
        this.anger = data.anger || 1;
        this.speed = data.speed || 1;
        this.attackDamage = data.attack_damage || 0;
        this.size = data.size || 2;
        this.restTime = data.rest_time || 1000;
    }
}

const _entityConfigData: { [key: string]: entityConfigData } = yaml.parse(
    fs.readFileSync(`${__dirname}/entities.yml`, "utf8")
);
export const entityConfigs: Map<number, EntityConfig> = new Map();

for (let [k, v] of Object.entries(_entityConfigData)) {
    const numericId = idMap.get(k);
    const entity = new EntityConfig(numericId, v);
    entityConfigs.set(numericId, entity);
}
