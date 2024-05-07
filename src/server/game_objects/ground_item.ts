import { OBJECT_CLASS, PACKET } from "../../shared/enums.js";
import { GameObject } from "../game_engine/game_object.js";
import { GroundItemData, Physics } from "../components/base.js";
import { round } from "../../lib/math.js";
import { degrees } from "../../lib/transforms.js";
import { Stats } from "../components/stats.js";

export class GroundItem extends GameObject {
    constructor(physics: Physics, itemData: GroundItemData) {
        super();

        const stats = new Stats();
        stats.data.set("health", { value: 1, min: 0, max: 1 });

        this.add(new Physics(physics))
            .add(new GroundItemData(itemData))
            .add(stats);

        this.pack[PACKET.SERVER.NEW_OBJECT] = () => {
            const physics = Physics.get(this);
            const data = GroundItemData.get(this);
            return [
                OBJECT_CLASS.ENTITY,
                [
                    this.id,
                    physics.position.x,
                    physics.position.y,
                    physics.rotation,
                    physics.size,
                    data.id,
                    false,
                ],
            ];
        };
        this.pack[PACKET.SERVER.MOVE_OBJECT] = () => {
            const physics = Physics.get(this);
            return [this.id, 100, physics.position.x, physics.position.y];
        };

        this.pack[PACKET.SERVER.ROTATE_OBJECT] = () => {
            const physics = Physics.get(this);
            return [this.id, round(degrees(physics.rotation))];
        };
    }
}
