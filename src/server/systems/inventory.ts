import { Inventory } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";

export class InventorySystem extends System {
    constructor() {
        super([Inventory]);

        this.listen("giveItem", this.giveItem.bind(this));
    }

    giveItem(objects: IterableIterator<GameObject>, items: [number, number][]) {
        for (const object of objects) {
            const inventory = Inventory.get(object)?.data;
            if (!inventory) {
                continue;
            }
            for (const [item, amount] of items) {
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
}
