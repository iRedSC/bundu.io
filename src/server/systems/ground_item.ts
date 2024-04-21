import random from "../../lib/random.js";
import { radians } from "../../lib/transforms.js";
import { GroundItemData, Physics } from "../components/base.js";
import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import { GroundItem } from "../game_objects/ground_item.js";
import SAT from "sat";

export class GroundItemSystem extends System {
    constructor() {
        super([GroundItemData]);

        this.listen("kill", this.kill, [GroundItemData]);
        this.listen("spawn_item", this.spawnItem, [Physics]);
    }

    kill: EventCallback<"kill"> = (item: GameObject, { source }) => {
        const data = GroundItemData.get(item);
        this.trigger("give_items", source.id, [[data.id, data.amount]]);
        this.trigger("delete_object", item.id);
        item.active = false;
    };

    spawnItem: EventCallback<"spawn_item"> = (
        origin: GameObject,
        { id, amount }
    ) => {
        const physics = Physics.get(origin);

        const spawnPos = physics.position.clone();
        const itemPhysics = {
            position: spawnPos,
            size: 15,
            collider: new SAT.Circle(spawnPos, 15),
            rotation: radians(random.integer(0, 360)),
            solid: false,
            speed: 0,
        };
        const itemType = { id: id, amount: amount };

        const item = new GroundItem(itemPhysics, itemType);

        this.world.addObject(item);
    };
}
