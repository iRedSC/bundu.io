import { EntityConfig } from "../configs/configs";
import { WorldObject } from "./base";
import { entityConfigs } from "../configs/configs";
import { distance, moveToward } from "../../lib/transforms";
import Random from "../../lib/random";

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
        const newPos = moveToward(
            this.position,
            this.ai.target,
            this.type.speed
        );
        if (Date.now() < this.ai.restTime) {
            return;
        }
        if (distance(this.position, this.ai.target) < 10) {
            this.setPosition(this.ai.target.x, this.ai.target.y);
            this.ai.restTime = Date.now() + 1000;
            this.ai.target = {
                x: this.ai.target.x + Random.integer(-250, 250),
                y: this.ai.target.y + Random.integer(-250, 250),
            };
        } else {
            this.setPosition(newPos.x, newPos.y);
        }
    }
}
