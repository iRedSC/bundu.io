import * as PIXI from "pixi.js";
import { round } from "../../lib/math";
import { lerp, rotationLerp } from "../../lib/transforms";
import { AnimationManager, AnimationMap } from "../../lib/animation";
import { Line } from "./line";
import { debugContainer } from "../debug";

// TODO: There are too many properties related to rotation clogging up the object.

// TODO: I'm using zod now, this can be a zod object.
type State = [time: number, x: number, y: number];
function typeofState(state?: State): state is State {
    if (!state) {
        return false;
    }
    return (
        typeof state[0] === "number" &&
        typeof state[1] === "number" &&
        typeof state[2] === "number"
    );
}

// The base object for rendering something in the world.
// Contains states for interpolating movement
// Separate system for interpolating rotation
export class WorldObject extends PIXI.Container {
    states: State[];
    interpolateRotation: boolean;
    lastRotation: number;
    nextRotation: number;
    rotationUpdate: number;
    rotationSpeed: number;
    debugLine?: PIXI.Graphics;

    animations?: AnimationMap<any>;

    constructor(pos: PIXI.Point, rotation: number) {
        super();
        this.position = pos;
        this.rotation = rotation;
        this.states = [];
        this.lastRotation = 0;
        this.nextRotation = 0;
        this.rotationUpdate = 0;
        this.interpolateRotation = true;
        this.rotationSpeed = 200;
    }

    move() {
        // remove state if it is in the past
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

        // interpolate between the two most recent states

        const now = Date.now() - 50;
        const t = (now - lastState[0]) / (nextState[0] - lastState[0]);
        const tClamped = Math.max(0, Math.min(1, t));
        const x = round(lerp(lastState[1], nextState[1], tClamped));
        const y = round(lerp(lastState[2], nextState[2], tClamped));

        if (this.interpolateRotation) {
            const rotationT = (now - this.rotationUpdate) / this.rotationSpeed;
            this.rotation = rotationLerp(
                this.lastRotation,
                this.nextRotation,
                rotationT
            );
        }
        this.position.set(x, y);
    }

    setState(state?: State) {
        if (typeofState(state)) {
            this.states.push(state);

            // if there was no state updates for a while, this will set the old state's time
            // to the present so it can update smoothly.
            if (this.states.length === 2) {
                this.states[0][0] = Date.now() - 50;
            }

            // {TESTING}
            // ? For debug purposes, can be removed later

            const lastState = this.states[0];
            const nextState = this.states[1];

            if (!nextState) {
                return;
            }

            if (this.debugLine) {
                debugContainer.removeChild(this.debugLine);
            }
            this.debugLine = new Line(
                [lastState[1], lastState[2]],
                [nextState[1], nextState[2]],
                0xff0000,
                25
            );
            debugContainer.addChild(this.debugLine);
        }
    }

    setRotation(rotation: number) {
        this.rotationUpdate = Date.now() - 50;
        this.lastRotation = this.rotation;
        this.nextRotation = rotation;
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
