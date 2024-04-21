import { round } from "../../lib/math.js";
import { degrees } from "../../lib/transforms.js";
import { OBJECT_CLASS, PACKET_TYPE } from "../../shared/enums.js";
import { Physics, Type } from "../components/base.js";
import { createResourceConfig } from "../configs/loaders/resources.js";
import { resourceConfigs } from "../configs/loaders/load.js";
import { GameObject } from "../game_engine/game_object.js";

/**
 * A resource node that gives an item when hurt.
 */
export class Resource extends GameObject {
    constructor(physics: Physics, type: Type) {
        super();

        const config =
            resourceConfigs.get(type.id) || createResourceConfig(type.id, {});

        this.add(config).add(new Physics(physics)).add(new Type(type));

        this.pack[PACKET_TYPE.NEW_OBJECT] = () => {
            const physics = Physics.get(this);
            const type = Type.get(this);
            return [
                OBJECT_CLASS.STRUCTURE,
                [
                    this.id,
                    round(physics.position.x),
                    round(physics.position.y),
                    round(degrees(physics.rotation)),
                    type.id,
                    physics.size,
                ],
            ];
        };
        this.pack[PACKET_TYPE.MOVE_OBJECT] = () => {
            const physics = Physics.get(this);
            return [
                this.id,
                50,
                round(physics.position.x),
                round(physics.position.y),
            ];
        };

        this.pack[PACKET_TYPE.ROTATE_OBJECT] = () => {
            const physics = Physics.get(this);
            return [this.id, round(degrees(physics.rotation))];
        };
    }
}
