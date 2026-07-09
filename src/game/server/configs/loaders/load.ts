import { ResourceConfigs } from "./resources.js";
import { getNumericId } from "@shared/id_map";
import { mergeObjects } from "@ioengine/lib";
import resourceConfig from "../resources.yml";

/** Load configs that the server actually uses. */
export function loadConfigs() {
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
}
