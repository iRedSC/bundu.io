import { ResourceConfig, resourceConfigs } from "../configs/configs.js";
import { WorldObject } from "./base.js";
export class Resource extends WorldObject {
    type: ResourceConfig;
    variant: number;

    constructor(
        id: number,
        position: [number, number],
        rotation: number,
        type: number,
        size: number,
        variant?: number
    ) {
        super(id, position, rotation, size);

        this.type = resourceConfigs.get(type) || new ResourceConfig(0, {});
        this.variant = variant || 0;
    }
}
