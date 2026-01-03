import { ResourceConfigs } from "./resources.js";
import { getNumericId } from "./id_map.js";
import { EntityConfigs } from "./entity.js";
import { type ItemConfig, ItemConfigs } from "./items.js";
import { mergeObjects, mergeObjs as combineObjects } from "@ioengine/lib";
import { BuildingConfigs } from "./buildings.js";

/**
 * This is where all the configs get loaded.
 */

import resourceConfig from "../resources.yml";
import itemTypes from "../item_types.yml";
import consumableConfig from "../consumable.yml";
import mainhandConfig from "../main_hand.yml";
import offhandConfig from "../off_hand.yml";
import wearableConfig from "../wearable.yml";
import placableConfig from "../placeable.yml";
import entityConfig from "../entities.yml";
import buildingConfig from "../buildings.yml";

export function loadConfigs() {
    // convert all item string ID's to numeric ones
    ResourceConfigs.parse(resourceConfig, (id, record, fallback) => {
        const numericItems: Record<number, number> = {};

        if (!record.items) record.items = {};

        for (const [item, amount] of Object.entries(record.items)) {
            const id = getNumericId(item);
            if (typeof id === "number") numericItems[id] = amount;
        }

        record.items = numericItems;
        return mergeObjects(record, undefined, fallback);
    });

    const types: Partial<Record<string, ItemConfig>> = itemTypes;

    // combine records with types fallback
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

    const itemConfigData = combineObjects(
        consumableConfig,
        mainhandConfig,
        offhandConfig,
        wearableConfig,
        placableConfig
    ) as any;
    ItemConfigs.parse(itemConfigData, typesCallback);
    // console.log(ItemConfigs.entries);

    EntityConfigs.parse(entityConfig);

    BuildingConfigs.parse(buildingConfig);
}
