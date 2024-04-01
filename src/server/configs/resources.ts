import { idMap, __dirname } from "./id_map.js";
import fs from "fs";
import yaml from "yaml";
import { ResourceConfig } from "../components/base.js";

type resourceConfigData = {
    level: number;
    regenSpeed: number;
    amount: number;
    item: number;
};

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
    return config as ResourceConfig;
}

const _resourceConfigData: { [key: string]: resourceConfigData } = yaml.parse(
    fs.readFileSync(`${__dirname}/resources.yml`, "utf8")
);
export const resourceConfigs: Map<number, ResourceConfig> = new Map();

for (let [k, v] of Object.entries(_resourceConfigData)) {
    const numericId = idMap.get(k);
    const resource = createResourceConfig(numericId, v);
    resourceConfigs.set(numericId, resource);
}
