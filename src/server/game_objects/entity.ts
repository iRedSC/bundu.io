import { EntityConfig } from "../configs/configs";
import { WorldObject } from "./base";
import { entityConfigs } from "../configs/configs";
import { moveToward } from "../../lib/transforms";

type Point = {
    x: number;
    y: number;
};

export class EntityAI {
    target: Point;
    restTime: number;
    constructor(position: Point) {
        this.target = position;
        this.restTime = 0;
    }
}

export class Entity extends WorldObject {
    type: EntityConfig;
    ai: EntityAI;

    constructor(
        id: number,
        type: number,
        position: [number, number],
        rotation: number
    ) {
        const config = entityConfigs.get(type) || new EntityConfig(0, {});
        super(id, position, rotation, config.size);
        this.type = config;
        this.ai = new EntityAI(this.position);
    }

    move() {
        // this.position = moveToward;
    }
}
