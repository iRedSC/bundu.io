import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import yaml from "yaml";
import { ReversableMap } from "../../shared/reverseable_map.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _idMapData: { [key: string]: number } = yaml.parse(
    fs.readFileSync(`${__dirname}/../../shared/id_map.yml`, "utf8")
);
export const idMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(_idMapData)) {
    idMap.set(k, v);
}

type resourceConfigData = {
    level: number;
    regenSpeed: number;
    amount: number;
    item: number;
};
export class ResourceConfig {
    id: number;
    level: number;
    regenSpeed: number;
    amount: number;
    item: number | null;

    constructor(id: number, data: Partial<resourceConfigData>) {
        this.id = id;
        this.level = data.level || 0;
        this.regenSpeed = data.regenSpeed || 10;
        this.amount = data.amount || 5;
        this.item = data.item || null;
    }
}

const _resourceConfigData: { [key: string]: resourceConfigData } = yaml.parse(
    fs.readFileSync(`${__dirname}/resources.yml`, "utf8")
);
export const resourceConfigs: Map<number, ResourceConfig> = new Map();

for (let [k, v] of Object.entries(_resourceConfigData)) {
    const numericId = idMap.get(k);

    const resource = new ResourceConfig(numericId, v);

    resourceConfigs.set(numericId, resource);
}

type itemConfigData = {
    type: string;
    attack_damage: number;
    defense: number;
    mining_level: number;
};
export class ItemConfig {
    id: number;
    type: string;
    attackDamage: number;
    defense: number;
    miningLevel: number;

    constructor(id: number, data: Partial<itemConfigData>) {
        this.id = id;
        this.type = data.type || "none";
        this.attackDamage = data.attack_damage || 0;
        this.defense = data.defense || 0;
        this.miningLevel = data.mining_level || 0;
    }
}

const _itemConfigData: { [key: string]: itemConfigData } = yaml.parse(
    fs.readFileSync(`${__dirname}/items.yml`, "utf8")
);
export const itemConfigs: Map<number, ItemConfig> = new Map();

for (let [k, v] of Object.entries(_itemConfigData)) {
    const numericId = idMap.get(k);

    const item = new ItemConfig(numericId, v);

    itemConfigs.set(numericId, item);
}

type entityConfigData = {
    anger: number;
    speed: number;
    attack_damage: number;
    size: number;
};
export class EntityConfig {
    id: number;
    anger: number;
    speed: number;
    attackDamage: number;
    size: number;

    constructor(id: number, data: Partial<entityConfigData>) {
        this.id = id;
        this.anger = data.anger || 1;
        this.speed = data.speed || 1;
        this.attackDamage = data.attack_damage || 0;
        this.size = data.size || 2;
    }
}

const _entityConfigData: { [key: string]: entityConfigData } = yaml.parse(
    fs.readFileSync(`${__dirname}/items.yml`, "utf8")
);
export const entityConfigs: Map<number, EntityConfig> = new Map();

for (let [k, v] of Object.entries(_entityConfigData)) {
    const numericId = idMap.get(k);

    const entity = new EntityConfig(numericId, v);

    entityConfigs.set(numericId, entity);
}
