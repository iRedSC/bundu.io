import fs from "fs";
import yaml from "yaml";
import { ResourceConfigs } from "./resources.js";
import { idMap, __dirname } from "./id_map.js";
import { EntityConfigs } from "./entity.js";
import { ItemConfigs } from "./items.js";
import { mergeObjs } from "../../../lib/object_utils.js";
import { ItemTypeConfigs } from "./item_type.js";

/**
 * This is where all the configs get loaded.
 */

function loadConfig(name: string) {
    return yaml.parse(fs.readFileSync(`${__dirname}/${name}`, "utf8"));
}

export function loadConfigs() {
    ResourceConfigs.parse(loadConfig("resources.yml"));
    for (const config of ResourceConfigs.entries.values()) {
        const numericItems: Record<number, number> = {};
        if (!config.items) config.items = {};
        for (const [item, amount] of Object.entries(config.items)) {
            const id = idMap.get(item);
            if (id === undefined) continue;
            numericItems[id] = amount;
        }
        config.items = numericItems;
    }
    const itemConfigData = mergeObjs(
        loadConfig("consumable.yml"),
        loadConfig("main_hand.yml"),
        loadConfig("off_hand.yml"),
        loadConfig("wearable.yml")
    ) as any;
    ItemConfigs.parse(itemConfigData);

    EntityConfigs.parse(loadConfig("entities.yml"));

    ItemTypeConfigs.parse(loadConfig("types.yml"));
}
