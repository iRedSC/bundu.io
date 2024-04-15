import { Inventory, PlayerData } from "../components/player.js";
import { itemConfigs, itemTypes } from "../configs/loaders/load.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { DropItemEvent } from "./events.js";

export class InventorySystem extends System {
    constructor() {
        super([Inventory]);

        this.listen("give_items", this.giveItems.bind(this), [Inventory]);
        this.listen("select_item", this.selectItem.bind(this), [
            Inventory,
            PlayerData,
        ]);
        this.listen("drop_item", this.dropItem.bind(this), [Inventory]);

        this.listen("update_inventory", this.changed.bind(this), [
            PlayerData,
            Inventory,
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

    dropItem(object: GameObject, { id, all }: DropItemEvent) {
        const inventory = Inventory.get(object).data;
        if (!inventory.items.has(id)) {
            return;
        }
        const amount = inventory.items.get(id)!;
        if (all || amount - 1 === 0) {
            inventory.items.delete(id);
            this.trigger("spawn_item", object.id, { id: id, amount: amount });
        } else {
            inventory.items.set(id, amount - 1);
            this.trigger("spawn_item", object.id, { id: id, amount: 1 });
        }
        this.trigger("update_inventory", object.id);
    }

    changed(player: GameObject) {
        const data = PlayerData.get(player)?.data;
        const inventory = Inventory.get(player)?.data;

        if (data.mainHand) {
            if (!inventory.items.has(data.mainHand)) {
                data.mainHand = -1;
            }
        }
        if (data.offHand) {
            if (!inventory.items.has(data.offHand)) {
                data.offHand = -1;
            }
        }
        if (data.helmet) {
            if (!inventory.items.has(data.helmet)) {
                data.helmet = -1;
            }
        }
        this.trigger("update_gear", player.id, [
            data.mainHand || -1,
            data.offHand || -1,
            data.helmet || -1,
            data.backpack || -1,
        ]);
    }
}
