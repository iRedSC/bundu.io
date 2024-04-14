import { GroundItemData } from "../components/base.js";
import { Inventory } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { HurtEvent } from "./events.js";

export class GroundItemSystem extends System {
    constructor() {
        super([GroundItemData]);

        this.listen("hurt", this.hurt.bind(this), [GroundItemData]);
    }

    hurt(item: GameObject, { source }: HurtEvent) {
        const data = GroundItemData.get(item).data;
        this.trigger("give_items", source.id, [[data.id, data.amount]]);
        this.trigger("delete_object", item.id);
        item.active = false;
    }
}
