import * as PIXI from "pixi.js";
import { round } from "../../lib/math";
import { lerp, rotationLerp } from "../../lib/transforms";
import { AnimationManager, AnimationMap, Keyframes } from "../../lib/animation";
import { Line } from "./line";
import { DebugWorldObject } from "../debug";
import { Circle } from "./circle";
import { z } from "zod";
import { validate } from "../../shared/type_guard";

// TODO: There are too many properties related to rotation clogging up the object.

// TODO: I'm using zod now, this can be a zod object.
const State = z.tuple([
    z.number(), // time
    z.number(), // x
    z.number(), // y
]);
type State = z.infer<typeof State>;

/**
 * The base object for rendering something in the world.
 * Contains states for interpolating movement
 * Separate system for interpolating rotation
 */
export class WorldObject extends PIXI.Container {
    id: number;
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

    constructor(id: number, pos: PIXI.Point, rotation: number, size: number) {
        super();

        this.id = id;

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
        this.size = size;
        const idTextStyle = new PIXI.TextStyle({ fontSize: 100 });
        const idText = new PIXI.Text(`ID: ${this.id}`, idTextStyle);
        idText.position = pos;
        this.debug.updateId(idText);
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

        const now = Date.now() - 50;

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
        if (!nextState) {
            return;
        }

        // interpolate between the two most recent states

        const t = (now - lastState[0]) / (nextState[0] - lastState[0]);
        const tClamped = Math.max(0, Math.min(1, t));
        const x = round(lerp(lastState[1], nextState[1], tClamped));
        const y = round(lerp(lastState[2], nextState[2], tClamped));

        this.position.set(x, y);
        if (this.debug.hitbox) {
            this.debug.hitbox.position.set(x, y);
        }
        if (this.debug.id) {
            this.debug.id.position.set(x, y);
        }
    }

    setState(state?: State) {
        if (validate(state, State)) {
            this.states.push(state);
            this.renderable = true;

            // if there was no state updates for a while, this will set the old state's time
            // to the present so it can update smoothly.
            if (this.states.length === 2) {
                this.states[0][0] = Date.now() - 50;
            }

            // {TESTING}
            // ? For debug purposes, can be removed later

            // const lastState = this.states[0];
            // const nextState = this.states[1];

            // if (!nextState) {
            //     return;
            // }

            // const debugLine = new Line(
            //     { x: lastState[1], y: lastState[2] },
            //     { x: nextState[1], y: nextState[2] },
            //     0xff0000,
            //     25
            // );
            // this.debug.updateStateLine(debugLine);
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
        this.scale.set(value / 15);

        const hitbox = new Circle(this.position, this._size, 0xff0000, 25);
        this.debug.updateHitbox(hitbox);
    }

    get size() {
        return this._size || 0;
    }
}
