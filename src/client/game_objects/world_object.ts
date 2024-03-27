import * as PIXI from "pixi.js";
import { round } from "../../lib/math";
import { lerp, rotationLerp } from "../../lib/transforms";
import { AnimationManager, AnimationMap, Keyframes } from "../../lib/animation";
import { Line } from "./line";
import { DebugWorldObject } from "../debug";
import { Circle } from "./circle";

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
    private _size?: number;
    states: State[];
    rotationProperties: {
        interpolate: boolean;
        last: number;
        next: number;
        time: number;
        speed: number;
    };
    debug: DebugWorldObject;

    animations?: AnimationMap<any>;

    constructor(pos: PIXI.Point, rotation: number, size: number) {
        super();

        this.animations = loadAnimations(this);

        this.position = pos;
        this.rotation = rotation;
        this.states = [];
        this.rotationProperties = {
            interpolate: true,
            last: 0,
            next: 0,
            time: 0,
            speed: 200,
        };
        this.setRotation(rotation);
        this.debug = new DebugWorldObject();
        console.log(this.position);
        this.size = size;
    }

    move() {
        // remove state if it is in the past
        const removeStaleStates = (tries = 0) => {
            const state = this.states[1];
            if (state && tries < 100) {
                if (Date.now() - 50 > state[0]) {
                    this.states = this.states.slice(1);
                    removeStaleStates(tries + 1);
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

        if (this.rotationProperties.interpolate) {
            const rotationT =
                (now - this.rotationProperties.time) /
                this.rotationProperties.speed;
            this.rotation = rotationLerp(
                this.rotationProperties.last,
                this.rotationProperties.next,
                rotationT
            );
        }
        this.position.set(x, y);

        if (this.debug.hitbox) {
            this.debug.hitbox.position.set(x, y);
        }
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

            const debugLine = new Line(
                { x: lastState[1], y: lastState[2] },
                { x: nextState[1], y: nextState[2] },
                0xff0000,
                25
            );
            this.debug.updateStateLine(debugLine);
        }
    }

    setRotation(rotation: number) {
        this.rotationProperties.time = Date.now() - 50;
        this.rotationProperties.last = this.rotation;
        this.rotationProperties.next = rotation;
    }

    trigger(id: number, manager: AnimationManager, replace: boolean = false) {
        if (!this.animations) {
            return;
        }
        const animation = this.animations.get(id);
        if (animation) {
            manager.add(this, animation.run(replace));
        }
    }

    set size(value: number) {
        this._size = value;
        this.scale.set(value / 1.2);

        const hitbox = new Circle(this.position, this._size * 10, 0xff0000, 25);
        this.debug.updateHitbox(hitbox);
    }

    get size() {
        return this._size || 0;
    }
}

export enum OBJECT_ANIMATION {
    HURT = 1,
}

function loadAnimations(target: WorldObject) {
    const hurtKeyframes: Keyframes<WorldObject> = new Keyframes();
    hurtKeyframes.frame(0).set = ({ target, animation }) => {
        if (animation.firstKeyframe) {
            animation.meta.scale = target.size;
            animation.goto(0, 100);
        }
        target.size = lerp(
            animation.meta.scale,
            animation.meta.scale - 0.5,
            animation.t
        );
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };
    hurtKeyframes.frame(1).set = ({ target, animation }) => {
        target.size = lerp(
            animation.meta.scale - 0.5,
            animation.meta.scale,
            animation.t
        );
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const animationMap = new AnimationMap(target);

    animationMap.set(OBJECT_ANIMATION.HURT, hurtKeyframes);
    return animationMap;
}
