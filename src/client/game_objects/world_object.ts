import * as PIXI from "pixi.js";
import { round } from "../../lib/math";
import { lerp, rotationLerp } from "../../lib/transforms";

export type SpriteManager = {
    container: PIXI.Container;
    [key: string]: any;
};

type Point = { x: number; y: number };

type State = [time: number, x: number, y: number, rotation: number];
function typeofState(state?: State): state is State {
    if (!state) {
        return false;
    }
    return (
        typeof state[0] === "number" &&
        typeof state[1] === "number" &&
        typeof state[2] === "number" &&
        typeof state[3] === "number"
    );
}
export class WorldObject {
    pos: Point;
    rotation: number;

    lastState: State;
    nextState: State;

    sprite: SpriteManager;

    constructor(pos: Point, rotation: number, sprite: SpriteManager) {
        this.pos = pos;
        this.rotation = rotation;
        this.sprite = sprite;

        this.lastState = [Date.now(), pos.x, pos.y, rotation];
        this.nextState = this.lastState;
    }

    move() {
        const now = Date.now();
        const t =
            (now - this.lastState[0]) / (this.nextState[0] - this.lastState[0]);
        this.pos.x = round(lerp(this.lastState[1], this.nextState[1], t));
        this.pos.y = round(lerp(this.lastState[2], this.nextState[2], t));
        this.rotation = rotationLerp(this.lastState[3], this.nextState[3], t);

        this.sprite.container.position = this.pos;
        this.sprite.container.rotation = this.rotation;
    }

    setState(state?: State) {
        if (typeofState(state)) {
            this.lastState = this.nextState;

            this.nextState = state;
            if (this.nextState[0] < this.lastState[0]) {
                this.nextState[0] = this.lastState[0];
            }
        }
    }
}
