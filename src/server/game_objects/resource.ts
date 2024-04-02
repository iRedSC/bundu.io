import { OBJECT_CLASS, PACKET_TYPE } from "../../shared/enums.js";
import { Physics, Type } from "../components/base.js";
import { createResourceConfig, resourceConfigs } from "../configs/resources.js";
import { GameObject } from "../game_engine/game_object.js";

/**
 * A resource node that gives an item when hurt.
 */
export class Resource extends GameObject {
    constructor(physics: Physics, type: Type) {
        super();

        const config =
            resourceConfigs.get(type.id) || createResourceConfig(type.id, {});

        this.add(config);
        this.add(new Physics(physics));
        this.add(new Type(type));

        this.pack[PACKET_TYPE.NEW_OBJECT] = () => {
            const physics = Physics.get(this).data;
            const type = Type.get(this).data;
            return [
                OBJECT_CLASS.STRUCTURE,
                [
                    this.id,
                    physics.position.x,
                    physics.position.y,
                    physics.rotation,
                    type.id,
                    physics.size,
                ],
            ];
        };
        this.pack[PACKET_TYPE.MOVE_OBJECT] = () => {
            const physics = Physics.get(this).data;
            return [this.id, 50, physics.position.x, physics.position.y];
        };

        this.pack[PACKET_TYPE.ROTATE_OBJECT] = () => {
            const physics = Physics.get(this).data;
            return [this.id, physics.rotation];
        };
    }
}
