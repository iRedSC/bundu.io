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

    pack(type: string) {
        switch (type) {
            case "moveObject":
                return [this.id, 10, this.x, this.y];
            case "rotateObject":
                return [this.id, this.rotation];
        }
        return [
            this.id,
            this.position.x,
            this.position.y,
            this.rotation,
            this.type.id,
            this.size,
        ];
    }
}
