import { Physics, ResourceData, Type } from "../components/base.js";
import { ResourceConfigs } from "../configs/loaders/resources.js";
import { GameObject } from "@ioengine/server";

/**
 * A resource node that gives an item when hurt.
 */
export class Resource extends GameObject {
    constructor(physics: Physics, type: Type) {
        super();

        const config = ResourceConfigs.get(type.id);
        this.add(
            new ResourceData({
                items: structuredClone(config.items),
                decayAt: config.decay,
                lastRegen: 0,
            })
        )
            .add(new Physics(physics))
            .add(new Type(type));
    }
}
