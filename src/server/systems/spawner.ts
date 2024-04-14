import random from "../../lib/random.js";
import { radians } from "../../lib/transforms.js";
import { Physics } from "../components/base.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { GroundItem } from "../game_objects/ground_item.js";
import SAT from "sat";

export class SpawnerSystem extends System {
    constructor() {
        super([]);

        this.listen("spawn_item", this.spawnItem.bind(this), [Physics]);
    }

    spawnItem(origin: GameObject, itemId: number) {
        const physics = Physics.get(origin).data;

        const spawnPos = physics.position.clone();
        const itemPhysics = {
            position: spawnPos,
            size: 15,
            collider: new SAT.Circle(spawnPos, 15),
            rotation: radians(random.integer(0, 360)),
            solid: false,
            speed: 0,
        };
        const itemType = { id: itemId };

        const item = new GroundItem(itemPhysics, itemType);

        console.log("spawning item " + itemId);
        this.world.addObject(item);
    }
}
