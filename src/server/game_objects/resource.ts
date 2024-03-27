import { PACKET_TYPE } from "../../shared/enums.js";
import { ResourceConfig, resourceConfigs } from "../configs/resources.js";
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

    pack(type: PACKET_TYPE) {
        switch (type) {
            case PACKET_TYPE.MOVE_OBJECT:
                return [this.id, 50, this.x, this.y];
            case PACKET_TYPE.ROTATE_OBJECT:
                return [this.id, this.rotation];
            case PACKET_TYPE.NEW_STRUCTURE:
                return [
                    this.id,
                    this.position.x,
                    this.position.y,
                    this.rotation,
                    this.type.id,
                    this.size,
                ];
        }
        return [];
    }
}
