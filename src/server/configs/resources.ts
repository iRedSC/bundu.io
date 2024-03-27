import { idMap, __dirname } from "./id_map.js";
import fs from "fs";
import yaml from "yaml";

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
