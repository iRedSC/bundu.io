import { Physics, ResourceConfig, Type } from "../components/base.js";
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

        this.add(new ResourceConfig(config));
        this.add(new Physics(physics));
        this.add(new Type(type));

        this.pack.new = () => {
            const physics = Physics.get(this).data;
            const type = Type.get(this).data;
            return [
                this.id,
                physics.position.x,
                physics.position.y,
                physics.rotation,
                type.id,
                physics.size,
            ];
        };
    }
}
