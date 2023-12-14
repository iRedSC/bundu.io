import * as PIXI from "pixi.js";
import { round } from "../../lib/math";
import { lerp, rotationLerp } from "../../lib/transforms";
import { AnimationManager, AnimationMap } from "../../lib/animation";

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
export class WorldObject extends PIXI.Container {
    lastState: State;
    nextState: State;

    animations?: AnimationMap<any>;

    constructor(pos: PIXI.Point, rotation: number) {
        super();
        this.position = pos;
        this.rotation = rotation;

        this.lastState = [Date.now(), pos.x, pos.y, rotation];
        this.nextState = this.lastState;
    }

    move() {
        const now = Date.now();
        const t =
            (now - this.lastState[0]) / (this.nextState[0] - this.lastState[0]);
        const x = round(lerp(this.lastState[1], this.nextState[1], t));
        const y = round(lerp(this.lastState[2], this.nextState[2], t));
        this.rotation = rotationLerp(this.lastState[3], this.nextState[3], t);
        this.position.set(x, y);
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

    trigger(id: number, manager: AnimationManager) {
        if (!this.animations) {
            return;
        }
        const animation = this.animations.get(id);
        if (animation) {
            manager.add(this, animation.run());
        }
    }
}
