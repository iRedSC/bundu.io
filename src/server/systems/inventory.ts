import { Inventory } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";

export class InventorySystem extends System {
    constructor() {
        super([Inventory]);

        this.listen("giveItem", this.giveItem.bind(this));
    }

    giveItem(object: GameObject, items: [number, number][]) {
        const inventory = Inventory.get(object)?.data;
        if (!inventory) {
            return;
        }
        for (const [item, amount] of items) {
            if (!(item >= 0)) {
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
        this.trigger("inventoryUpdate", object.id);
    }
}
