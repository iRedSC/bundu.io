import yaml from "yaml";
import fs from "fs";
import { idMap, __dirname } from "./id_map.js";

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
