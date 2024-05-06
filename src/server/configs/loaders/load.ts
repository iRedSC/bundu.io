import fs from "fs";
import yaml from "yaml";
import { ResourceConfigs } from "./resources.js";
import { idMap, __dirname } from "./id_map.js";
import { EntityConfigs } from "./entity.js";
import { ItemConfig, ItemConfigs } from "./items.js";
import { mergeObjects, mergeObjs } from "../../../lib/object_utils.js";
import { BuildingConfigs } from "./buildings.js";

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

    const types: Partial<Record<string, ItemConfig>> =
        loadConfig("item_types.yml");
    const typesCallback = (
        id: string,
        record: Partial<ItemConfig>,
        fallback: ItemConfig
    ): ItemConfig => {
        let typeRecord = types[record.type ?? "none"];
        if (!typeRecord) typeRecord = fallback;

        record.attributes = mergeObjects(
            typeRecord.attributes,
            record.attributes,
            {}
        );
        record.stats = mergeObjects(typeRecord.stats, record.stats, {});
        record.flags = [...(typeRecord.flags ?? []), ...(record.flags ?? [])];

        const fullRecord = mergeObjects(typeRecord, record, fallback);

        return fullRecord;
    };

    const itemConfigData = mergeObjs(
        loadConfig("consumable.yml"),
        loadConfig("main_hand.yml"),
        loadConfig("off_hand.yml"),
        loadConfig("wearable.yml"),
        loadConfig("placeable.yml")
    ) as any;
    ItemConfigs.parse(itemConfigData, typesCallback);
    console.log(ItemConfigs.entries);

    EntityConfigs.parse(loadConfig("entities.yml"));

    BuildingConfigs.parse(loadConfig("buildings.yml"));
}
