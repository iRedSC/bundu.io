import { EntityConfig } from "../configs/configs.js";
import { WorldObject } from "./base.js";
import { entityConfigs } from "../configs/configs.js";
import { distance, lookToward, moveToward } from "../../lib/transforms.js";
import Random from "../../lib/random.js";

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
        if (distance(this.position, this.ai.target) < this.type.speed) {
            this.setPosition(this.ai.target.x, this.ai.target.y);
            this.ai.restTime = Date.now() + 1000;
            this.ai.target = {
                x:
                    this.ai.target.x +
                    Random.integer(
                        -this.type.wanderRange,
                        this.type.wanderRange
                    ),
                y:
                    this.ai.target.y +
                    Random.integer(
                        -this.type.wanderRange,
                        this.type.wanderRange
                    ),
            };
        } else {
            this.rotation = lookToward(this.ai.target, this.position);
            this.setPosition(newPos.x, newPos.y);
        }
    }

    pack() {
        return [this.id, this.position.x, this.position.y, this.rotation];
    }
    packNew() {
        return [
            this.id,
            this.type.id,
            this.position.x,
            this.position.y,
            this.rotation,
            this.collider.r,
        ];
    }
}
