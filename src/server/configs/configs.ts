import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import yaml from "yaml";
import { ReversableMap } from "../../shared/reverseable_map.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _itemMapData: { [key: string]: number } = yaml.parse(
    fs.readFileSync(`${__dirname}/resources.yml`, "utf8")
);

export const itemMap: ReversableMap<string, number> = new ReversableMap();

for (let [k, v] of Object.entries(_itemMapData)) {
    itemMap.set(k, v);
}

const _resourceConfigData: { [key: string]: resourceConfigData } = yaml.parse(
    fs.readFileSync(`${__dirname}/resources.yml`, "utf8")
);

type resourceConfigData = {
    level: number;
    regenSpeed: number;
    amount: number;
    item: string;
};
export class ResourceConfig {
    id: number;
    level: number;
    regenSpeed: number;
    amount: number;
    item: string | null;

    constructor(id: number, data: Partial<resourceConfigData>) {
        this.id = id;
        this.level = data.level || 0;
        this.regenSpeed = data.regenSpeed || 10;
        this.amount = data.amount || 5;
        this.item = data.item || null;
    }
}

export const resourceConfig: Map<number, ResourceConfig> = new Map();

for (let [k, v] of Object.entries(_resourceConfigData)) {
    const numericId = itemMap.get(k);

    const resource = new ResourceConfig(numericId, {
        level: v.level,
        regenSpeed: v.regenSpeed,
        amount: v.amount,
        item: v.item,
    });

    resourceConfig.set(numericId, resource);
}
