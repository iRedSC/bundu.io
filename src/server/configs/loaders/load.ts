import fs from "fs";
import yaml from "yaml";
import {
    ResourceConfig,
    createResourceConfig,
    resourceConfigData,
} from "./resources.js";
import { Component } from "../../game_engine/component.js";
import { idMap, __dirname } from "./id_map.js";
import {
    EntityConfig,
    createEntityConfig,
    entityConfigData,
} from "./entity.js";

/**
 * This is where all the configs get loaded.
 */

export function createConfigMap<D extends object, C extends Component<any>>(
    data: D,
    config: (id: number, data: Partial<D>) => C
) {
    const configMap: Map<number, C> = new Map();

    for (let [k, v] of Object.entries(data)) {
        const numericId = idMap.get(k);
        const resource = config(numericId, v);
        configMap.set(numericId, resource);
    }
    return configMap;
}

type RawResourceConfig = { [key: string]: resourceConfigData };
const _resourceConfigData: RawResourceConfig = yaml.parse(
    fs.readFileSync(`${__dirname}/resources.yml`, "utf8")
);
export const resourceConfigs = createConfigMap<
    RawResourceConfig,
    Component<ResourceConfig>
>(_resourceConfigData, createResourceConfig);

// type RawItemConfig = { [key: string]: itemConfigData };
// const _itemConfigData: RawItemConfig = yaml.parse(
//     fs.readFileSync(`${__dirname}/items.yml`, "utf8")
// );
// export const itemConfigs = createConfigMap<
//     RawItemConfig,
//     Component<ItemConfig>
// >(_itemConfigData, createItemConfig);

type RawEntityConfig = { [key: string]: entityConfigData };
const _entityConfigData: RawEntityConfig = yaml.parse(
    fs.readFileSync(`${__dirname}/entities.yml`, "utf8")
);

export const entityConfigs = createConfigMap<
    RawEntityConfig,
    Component<EntityConfig>
>(_entityConfigData, createEntityConfig);
