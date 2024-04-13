import { Flags } from "../components/base.js";
import { Inventory } from "../components/player.js";
import { craftingList } from "../configs/loaders/crafting.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";

export class CraftingSystem extends System {
    constructor() {
        super([Inventory]);

        this.listen("craft_item", this.craftItem.bind(this));
    }

    craftItem(player: GameObject, item: number) {
        const inventory = Inventory.get(player).data;
        const flags = Flags.get(player).data;
        const recipe = craftingList.get(item);
        if (!recipe) {
            return;
        }
        // console.log(`Recipe ${item} exists`);
        // for (const flag of recipe.flags) {
        //     if (!flags.has(flag)) {
        //         return;
        //     }
        // }
        // console.log(`Passed flag check`);
        for (const [id, amount] of recipe.ingredients.entries()) {
            const item = inventory.items.get(id);
            if (!item) {
                return;
            }
            if (item < amount) {
                return;
            }
        }
        console.log("Passed ingredients check");
        for (const [id, amount] of recipe.ingredients.entries()) {
            const item = inventory.items.get(id)!;
            const newAmount = item - amount;
            if (newAmount <= 0) {
                inventory.items.delete(id);
                continue;
            }
            inventory.items.set(id, newAmount);
        }
        console.log("items removed");
        const existingItem = inventory.items.get(item);
        if (!existingItem) {
            inventory.items.set(item, 1);
        } else {
            inventory.items.set(item, existingItem + 1);
        }
        console.log("sending inventory");
        this.trigger("update_inventory", player.id);
    }
}
