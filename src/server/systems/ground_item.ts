import random from "../../lib/random.js";
import { radians } from "../../lib/transforms.js";
import { GroundItemData, Physics } from "../components/base.js";
import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import { GroundItem } from "../game_objects/ground_item.js";
import SAT from "sat";
import { getSizedBounds, quadtree } from "./position.js";

export class GroundItemSystem extends System {
    constructor() {
        super([GroundItemData], 1);

        this.listen("kill", this.kill, [GroundItemData]);
        this.listen("spawn_item", this.spawnItem, [Physics]);
    }

    update(time: number, delta: number, item: GameObject) {
        const data = item.get(GroundItemData);
        if (data.despawnTime < Date.now()) {
            this.trigger("kill", item.id, {});
        }
    }

    kill: EventCallback<"kill"> = (item: GameObject, { source }) => {
        const data = GroundItemData.get(item);
        this.trigger("delete_object", item.id);
        this.world.removeObject(item);
        if (source) {
            this.trigger("give_item", source.id, data);
        }
    };

    spawnItem: EventCallback<"spawn_item"> = (
        origin: GameObject,
        { id, amount }
    ) => {
        const physics = Physics.get(origin);

        const stackCheckBounds = getSizedBounds(physics.position, 50, 50);

        const nearby = quadtree.query(stackCheckBounds);
        const items = this.world.query([GroundItemData], nearby);

        for (const item of items) {
            const data = item.get(GroundItemData);
            if (data.id === id) {
                data.amount += amount;
                data.despawnTime = Date.now() + 15000 + amount * 1000;
                return;
            }
        }

        const spawnPos = physics.position.clone();
        const itemPhysics = {
            position: spawnPos,
            size: 15,
            collider: new SAT.Circle(spawnPos, 15),
            rotation: radians(random.integer(0, 360)),
            solid: false,
            speed: 0,
        };
        const itemType = {
            id: id,
            amount: amount,
            despawnTime: Date.now() + 15000 + amount * 1000,
        };

        const item = new GroundItem(itemPhysics, itemType);

        this.world.addObject(item);
    };
}
