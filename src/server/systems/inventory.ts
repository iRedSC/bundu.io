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
import { GlobalPacketFactory } from "../globals.js";
import { PACKET } from "../../shared/enums.js";

const UUID = () => {
    return String("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx").replace(
        /[xy]/g,
        (character) => {
            const random = (Math.random() * 16) | 0;
            const value = character === "x" ? random : (random & 0x3) | 0x8;

            return value.toString(16);
        }
    );
};
export class InventorySystem extends System {
    constructor() {
        super([Inventory]);

        this.listen("give_item", this.giveItem);
        this.listen("remove_item", this.removeItem);
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

    removeItem: EventCallback<"remove_item"> = (
        object: GameObject,
        { id, amount }
    ) => {
        if (amount === undefined) amount = 1;
        if (amount <= 0 || id === undefined) return;

        const inventory = Inventory.get(object);
        if (!inventory) return;

        this.trigger("update_inventory", object.id);
        const existing = inventory.items.get(id);
        if (!existing) return;
        if (existing - amount <= 0) {
            inventory.items.delete(id);
        } else {
            inventory.items.set(id, existing - amount);
        }
    };

    selectItem: EventCallback<"select_item"> = (
        player: GameObject,
        item: number
    ) => {
        const setAttrs = (
            name: string,
            attributes: AttributesData,
            attrs: Partial<
                Record<AttributeType, { op: "add" | "multiply"; value: number }>
            >,
            duration?: number
        ) => {
            for (const [type, attr] of Object.entries(attrs) as [
                AttributeType,
                { op: "add" | "multiply"; value: number }
            ][]) {
                attributes.set(type, name, attr.op, attr.value, duration);
            }
        };

        const data = PlayerData.get(player);
        const inventory = Inventory.get(player);
        const config = ItemConfigs.get(item);
        const attributes = Attributes.get(player);

        if (!inventory.items.has(item) || !config.type) return;

        switch (config.function) {
            case "wear":
                data.helmet = data.helmet === item ? undefined : item;
                if (data.helmet !== undefined) {
                    setAttrs("helmet", attributes, config.attributes);
                    break;
                }
                attributes?.clear("helmet");
                break;
            case "main_hand":
                data.mainHand = data.mainHand === item ? undefined : item;
                if (data.mainHand !== undefined) {
                    setAttrs("main_hand", attributes, config.attributes);
                    break;
                }
                attributes?.clear("main_hand");
                break;
            case "off_hand":
                data.offHand = data.offHand === item ? undefined : item;
                if (data.helmet !== undefined) {
                    setAttrs("off_hand", attributes, config.attributes);
                    break;
                }
                attributes?.clear("off_hand");
                break;
            case "consume":
                this.trigger("remove_item", player.id, { id: item, amount: 1 });
                setAttrs(UUID(), attributes, config.attributes, 5000);
                break;
            case "building":
                GlobalPacketFactory.add(
                    player.id,
                    [PACKET.SERVER.SELECT_STRUCTURE],
                    () => [item, 5]
                );
                break;
        }

        this.trigger("update_gear", player.id, [
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
