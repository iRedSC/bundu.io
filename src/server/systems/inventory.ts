import { PlayerData } from "../components/player.js";
import { Inventory } from "../components/inventory.js";
import { ItemConfigs } from "../configs/loaders/items.js";

import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import {
    AttributeType,
    Attributes,
    AttributesData,
} from "../components/attributes.js";

export class InventorySystem extends System {
    constructor() {
        super([Inventory]);

        this.listen("give_item", this.giveItem);
        this.listen("select_item", this.selectItem, [Inventory, PlayerData]);
        this.listen("drop_item", this.dropItem, [Inventory]);

        this.listen("update_inventory", this.changed, [PlayerData, Inventory]);
    }

    giveItem: EventCallback<"give_item"> = (
        object: GameObject,
        { id, amount }
    ) => {
        if (amount === undefined) amount = 1;
        if (amount <= 0 || id === undefined) return;

        const inventory = Inventory.get(object);
        if (!inventory) {
            this.trigger("spawn_item", object.id, { id, amount });
            return;
        }
        this.trigger("update_inventory", object.id);
        const existing = inventory.items.get(id);
        if (!existing) {
            if (inventory.items.size >= inventory.slots) {
                this.trigger("spawn_item", object.id, { id, amount });
                return;
            }
            inventory.items.set(id, amount);
            return;
        }
        inventory.items.set(id, existing + amount);
    };

    selectItem: EventCallback<"select_item"> = (
        object: GameObject,
        item: number
    ) => {
        const setAttrs = (
            name: string,
            attributes: AttributesData,
            attrs: Partial<Record<AttributeType, ["add" | "multiply", number]>>
        ) => {
            for (const [type, attr] of Object.entries(attrs) as [
                AttributeType,
                ["add" | "multiply", number]
            ][]) {
                attributes.set(type, name, attr[0], attr[1]);
            }
        };

        const data = PlayerData.get(object);
        const inventory = Inventory.get(object);
        const config = ItemConfigs.get(item);
        const attributes = object.get(Attributes);

        if (!inventory.items.has(item) || !config.type) return;

        const attrMap: Partial<
            Record<AttributeType, ["add" | "multiply", number]>
        > = {
            "attack.damage": ["add", config.attack_damage ?? 0],
            "attack.origin": ["add", config.attack_origin ?? 0],
            "attack.reach": ["add", config.attack_reach ?? 0],
            "attack.sweep": ["add", config.attack_sweep ?? 0],
            "attack.speed": ["multiply", config.attack_speed_mult ?? 0],
            "health.defense": ["add", config.defense],
            "movement.speed": ["multiply", config.speed_multiplier],
        };
        console.log(config);
        switch (config.function) {
            case "wear":
                data.helmet = data.helmet === item ? undefined : item;
                if (data.helmet !== undefined) {
                    setAttrs("helmet", attributes, attrMap);
                    break;
                }
                attributes?.clear("helmet");
                break;
            case "main_hand":
                data.mainHand = data.mainHand === item ? undefined : item;
                if (data.mainHand !== undefined) {
                    setAttrs("main_hand", attributes, attrMap);
                    break;
                }
                attributes?.clear("main_hand");
                break;
            case "off_hand":
                data.offHand = data.offHand === item ? undefined : item;
                if (data.helmet !== undefined) {
                    setAttrs("off_hand", attributes, attrMap);
                    break;
                }
                attributes?.clear("off_hand");
                break;
        }

        this.trigger("update_gear", object.id, [
            data.mainHand || -1,
            data.offHand || -1,
            data.helmet || -1,
            data.backpack || false,
        ]);
    };

    dropItem: EventCallback<"drop_item"> = (
        object: GameObject,
        { id, all }
    ) => {
        const inventory = Inventory.get(object);
        if (!inventory.items.has(id)) return;

        const amount = inventory.items.get(id)!;
        if (all || amount - 1 === 0) {
            inventory.items.delete(id);
            this.trigger("spawn_item", object.id, { id: id, amount: amount });
        } else {
            inventory.items.set(id, amount - 1);
            this.trigger("spawn_item", object.id, { id: id, amount: 1 });
        }
        this.trigger("update_inventory", object.id);
    };

    changed: EventCallback<"update_inventory"> = (player: GameObject) => {
        const data = PlayerData.get(player);
        const inventory = Inventory.get(player);

        if (data.mainHand)
            if (!inventory.items.has(data.mainHand)) data.mainHand = -1;

        if (data.offHand)
            if (!inventory.items.has(data.offHand)) data.offHand = -1;

        if (data.helmet)
            if (!inventory.items.has(data.helmet)) data.helmet = -1;

        this.trigger("update_gear", player.id, [
            data.mainHand || -1,
            data.offHand || -1,
            data.helmet || -1,
            data.backpack || false,
        ]);
    };
}
