import { ResourceConfigs } from "./resources.js";
import { getNumericId } from "@bundu/shared/id_map";
import { mergeObjects, mergeObjs } from "@bundu/shared";
import resourceConfig from "../resources.yml";
import itemTypes from "../item_types.yml";
import consumableConfig from "../consumable.yml";
import mainhandConfig from "../main_hand.yml";
import offhandConfig from "../off_hand.yml";
import wearableConfig from "../wearable.yml";
import placeableConfig from "../placeable.yml";
import buildingConfig from "../buildings.yml";
import { type ItemConfig, ItemConfigs } from "./items.js";
import { BuildingConfigs } from "./buildings.js";

/** Load configs that the server actually uses. */
export function loadConfigs() {
    BuildingConfigs.parse(buildingConfig);

    ResourceConfigs.parse(resourceConfig, (_id, record, fallback) => {
        const numericItems: Record<number, number> = {};

        if (!record.items) record.items = {};

        for (const [item, amount] of Object.entries(record.items)) {
            const id = getNumericId(item);
            if (typeof id === "number") numericItems[id] = amount;
        }

        record.items = numericItems;
        return mergeObjects(record, undefined, fallback);
    });

    const types = itemTypes as Partial<Record<string, Partial<ItemConfig>>>;

    const typesCallback = (
        _id: string,
        record: Partial<ItemConfig>,
        fallback: ItemConfig
    ): ItemConfig => {
        const typeRecord = types[record.type ?? "none"] ?? fallback;

        record.attributes = mergeObjects(
            typeRecord.attributes,
            record.attributes,
            {}
        );
        record.stats = mergeObjects(typeRecord.stats, record.stats, {});
        record.flags = [...(typeRecord.flags ?? []), ...(record.flags ?? [])];

        return mergeObjects(typeRecord, record, fallback);
    };

    const itemConfigData = mergeObjs(
        consumableConfig,
        mainhandConfig,
        offhandConfig,
        wearableConfig,
        placeableConfig
    ) as Record<string, Partial<ItemConfig>>;

    ItemConfigs.parse(itemConfigData, typesCallback);
}
