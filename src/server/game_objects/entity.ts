import { EntityConfig } from "../configs/configs.js";
import { WorldObject } from "./base.js";
import { entityConfigs } from "../configs/configs.js";
import { lerp, distance, lookToward, degrees } from "../../lib/transforms.js";
import Random from "../../lib/random.js";
import SAT from "sat";

type Point = {
    x: number;
    y: number;
};

export class EntityAI {
    target: SAT.Vector;
    arriveTime: number;
    travelTime: number;
    _lastPos: { x: number; y: number };
    _lastMoveTime: number;
    constructor(position: SAT.Vector) {
        this.target = position;
        this.arriveTime = 0;
        this.travelTime = 0;
        this._lastMoveTime = 0;
        this._lastPos = position;
    }
}

export class Entity extends WorldObject {
    type: EntityConfig;
    ai: EntityAI;
    angry: boolean;

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
        this.updateTarget([]);
        this.angry = false;
    }

    move(collisionObjects: Iterable<WorldObject>): boolean {
        const totalTime = this.ai.arriveTime - this.ai._lastMoveTime;
        const elapsedTime = Date.now() - this.ai._lastMoveTime;
        const t = elapsedTime / totalTime;
        const tClamped = Math.max(0, Math.min(1, t));
        this.setPosition(
            lerp(this.ai._lastPos.x, this.ai.target.x, tClamped),
            lerp(this.ai._lastPos.y, this.ai.target.y, tClamped)
        );
        if (t >= 1 + this.type.restTime) {
            this.updateTarget(collisionObjects);
            return true;
        }
        return false;
    }

    private updateTarget(
        collisionObjects: Iterable<WorldObject>,
        leapReduction: number = 0
    ) {
        this.ai._lastPos = { ...this.position };
        this.ai._lastMoveTime = Date.now();
        const range = Math.max(this.type.wanderRange - leapReduction, 0);
        this.ai.target = new SAT.Vector(
            this.ai.target.x + Random.integer(-range, range),

            this.ai.target.y + Random.integer(-range, range)
        );
        const hit = raycast(this.position, this.ai.target, collisionObjects);

        if (hit) {
            this.updateTarget(collisionObjects, leapReduction + 30);
        }
        this.ai.travelTime =
            distance(this.position, this.ai.target) / (this.type.speed / 5);
        this.ai.arriveTime = Date.now() + this.ai.travelTime;
        this.rotation = lookToward(this.ai._lastPos, this.ai.target);
    }

    pack(type: string) {
        switch (type) {
            case "moveObject":
                return [
                    this.id,
                    this.ai.travelTime,
                    this.ai.target.x,
                    this.ai.target.y,
                ];
            case "rotateObject":
                return [this.id, this.rotation];
        }
        return [
            this.id,
            this.position.x,
            this.position.y,
            this.rotation,
            this.type.id,
            this.angry,
        ];
    }
}

function raycast(
    start: SAT.Vector,
    end: SAT.Vector,
    collisionTest: Iterable<WorldObject>
) {
    const line = new SAT.Polygon(start, [
        new SAT.Vector(),
        end.clone().sub(start),
    ]);
    for (const other of collisionTest) {
        const response = new SAT.Response();
        const overlap = SAT.testPolygonCircle(line, other.collider, response);
        if (overlap) {
            return true;
        }
    }
    return false;
}
