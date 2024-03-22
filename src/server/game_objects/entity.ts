import { EntityConfig } from "../configs/configs.js";
import { WorldObject } from "./base.js";
import { entityConfigs } from "../configs/configs.js";
import { lerp, distance } from "../../lib/transforms.js";
import Random from "../../lib/random.js";

type Point = {
    x: number;
    y: number;
};

export class EntityAI {
    target: Point;
    restTime: number;
    time: number;
    constructor(position: Point) {
        this.target = position;
        this.restTime = 0;
        this.time = 0;
    }
}

export class Entity extends WorldObject {
    type: EntityConfig;
    ai: EntityAI;
    _lastPos: { x: number; y: number };
    _lastMoveTime: number;
    _resting: boolean;

    constructor(
        id: number,
        type: number,
        position: [number, number],
        rotation: number
    ) {
        const config = entityConfigs.get(type) || new EntityConfig(0, {});
        super(id, position, rotation, config.size);
        this._lastMoveTime = 0;
        this._resting = false;
        this.type = config;
        this.ai = new EntityAI(this.position);
        this.updateTarget();
    }

    move() {
        const totalTime = this.ai.time - this._lastMoveTime;
        const elapsedTime = Date.now() - this._lastMoveTime;
        const t = elapsedTime / totalTime;
        const tClamped = Math.max(0, Math.min(1, t));
        this.setPosition(
            lerp(this.x, this.ai.target.x, tClamped),
            lerp(this.y, this.ai.target.y, tClamped)
        );
        if (t >= 1) {
            this.updateTarget();
        }
    }

    private updateTarget() {
        this._lastPos = { ...this.position };
        this._lastMoveTime = Date.now();
        this.ai.target = {
            x:
                this.ai.target.x +
                Random.integer(-this.type.wanderRange, this.type.wanderRange),
            y:
                this.ai.target.y +
                Random.integer(-this.type.wanderRange, this.type.wanderRange),
        };
        this.ai.time =
            Date.now() +
            distance(this.position, this.ai.target) / this.type.speed;
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
            this.size,
        ];
    }
}
