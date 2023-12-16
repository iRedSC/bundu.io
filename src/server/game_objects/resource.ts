import { ResourceConfig, resourceConfigs } from "../configs/configs";
import { WorldObject } from "./base";

const resourceConfigFallback = new ResourceConfig(0, {});
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

        this.type = resourceConfigs.get(type) || resourceConfigFallback;
        this.variant = variant || 0;
    }
}
