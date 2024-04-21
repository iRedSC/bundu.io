import { OBJECT_CLASS, PACKET_TYPE } from "../../shared/enums.js";
import { GameObject } from "../game_engine/game_object.js";
import { GroundItemData, Physics } from "../components/base.js";
import { round } from "../../lib/math.js";
import { degrees } from "../../lib/transforms.js";
import { Health } from "../components/combat.js";

export class GroundItem extends GameObject {
    constructor(physics: Physics, itemData: GroundItemData) {
        super();

        this.add(new Physics(physics))
            .add(new GroundItemData(itemData))
            .add(new Health({ max: 1, value: 1 }));

        this.pack[PACKET_TYPE.NEW_OBJECT] = () => {
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
        this.pack[PACKET_TYPE.MOVE_OBJECT] = () => {
            const physics = Physics.get(this);
            return [this.id, 100, physics.position.x, physics.position.y];
        };

        this.pack[PACKET_TYPE.ROTATE_OBJECT] = () => {
            const physics = Physics.get(this);
            return [this.id, round(degrees(physics.rotation))];
        };
    }
}
