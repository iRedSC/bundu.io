import * as PIXI from "pixi.js";
import { round } from "../../lib/math";
import { lerp, rotationLerp } from "../../lib/transforms";
import { AnimationManager, AnimationMap } from "../../lib/animation";
import { Line } from "./line";
import { debugContainer } from "../debug";

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
    states: State[];

    animations?: AnimationMap<any>;

    constructor(pos: PIXI.Point, rotation: number) {
        super();
        this.position = pos;
        this.rotation = rotation;
        this.states = [];
    }

    move() {
        const removeStaleStates = () => {
            const state = this.states[1];
            if (state) {
                if (Date.now() - 50 > state[0]) {
                    this.states = this.states.slice(1);
                    removeStaleStates();
                }
            }
        };
        removeStaleStates();

        const lastState = this.states[0];
        const nextState = this.states[1];

        if (!nextState) {
            return;
        }

        // for (const state of this.states) {
        //     console.log(state[0]);
        // }
        // console.log("-------------");
        const now = Date.now() - 50;
        const t = (now - lastState[0]) / (nextState[0] - lastState[0]);
        const tClamped = Math.max(0, Math.min(1, t));
        const x = round(lerp(lastState[1], nextState[1], tClamped));
        const y = round(lerp(lastState[2], nextState[2], tClamped));

        const rotationT = (now - lastState[0]) / 150;
        this.rotation = rotationLerp(lastState[3], nextState[3], rotationT);
        // this.rotation = this.nextState[3];
        this.position.set(x, y);
    }

    setState(state?: State) {
        if (typeofState(state)) {
            this.states.push(state);
            console.log(this.states);
            if (this.states.length === 2) {
                this.states[0][0] = Date.now() - 50;
            }

            const lastState = this.states[0];
            const nextState = this.states[1];

            if (!nextState) {
                return;
            }

            const line = new Line(
                [lastState[1], lastState[2]],
                [nextState[1], nextState[2]],
                0xff0000,
                25
            );
            debugContainer.addChild(line);
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
