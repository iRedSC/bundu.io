import { Inventory, PlayerData } from "../components/player.js";
import { itemConfigs, itemTypes } from "../configs/loaders/load.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";

export class InventorySystem extends System {
    constructor() {
        super([Inventory]);

        this.listen("give_items", this.giveItems.bind(this), [Inventory]);
        this.listen("select_item", this.selectItem.bind(this), [
            Inventory,
            PlayerData,
        ]);
    }

    giveItems(object: GameObject, items: [number, number][]) {
        const inventory = Inventory.get(object)?.data;
        if (!inventory) {
            return;
        }
        for (const [item, amount] of items) {
            if (!(item >= 0) || amount <= 0) {
                continue;
            }
            const existing = inventory.items.get(item);
            if (!existing) {
                if (inventory.items.size >= inventory.slots) {
                    continue;
                }
                inventory.items.set(item, amount);
                continue;
            }
            inventory.items.set(item, existing + amount);
        }
        this.trigger("update_inventory", object.id);
    }

    selectItem(object: GameObject, item: number) {
        const data = PlayerData.get(object)?.data;
        const inventory = Inventory.get(object)?.data;
        const config = itemConfigs.get(item)?.data;

        if (!inventory.items.has(item) || !config) {
            return;
        }
        if (itemTypes[config.type]?.function === "wear") {
            data.helmet = data.helmet === item ? -1 : item;
        } else if (itemTypes[config.type]?.function === "main_hand") {
            data.mainHand = data.mainHand === item ? -1 : item;
        } else if (itemTypes[config.type]?.function === "off_hand") {
            data.offHand = data.offHand === item ? -1 : item;
        }

        this.trigger("update_gear", object.id, [
            data.mainHand || -1,
            data.offHand || -1,
            data.helmet || -1,
            data.backpack || -1,
        ]);
    }
}
