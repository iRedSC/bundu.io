import { __dirname } from "./id_map.js";
import { mergeObjects } from "../../../lib/object_utils.js";

export type itemTypeConfigData = {
    function: string;
    speed_multiplier: number;
};

export type ItemType = {
    id: string;
    function: string;
    speed_multiplier: number;
};

const defaultItemConfig: ItemType = {
    id: "",
    function: "none",
    speed_multiplier: 1,
};

export function createItemConfig(
    id: string,
    data: Partial<itemTypeConfigData>
) {
    const config = mergeObjects<ItemType>(
        undefined,
        { id: id, ...data },
        defaultItemConfig
    );
    return config as ItemType;
}
