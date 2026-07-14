import { round } from "@bundu/shared";
import type { Animation, AnimationManager } from "../animation/runtime";
import { createObjectDebug } from "../debug/object_debug";
import type { ObjectDebug } from "../debug/types";
import {
    PositionStates,
    RotationStates,
    type PositionState,
    type RotationState,
} from "./states";
import { Container, type Point } from "pixi.js";

/**
 * The base object for rendering something in the world.
 * Contains states for interpolating movement
 * Separate system for interpolating rotation
 */
export default class GameObject {
    container: Container;

    id: number;

    private _renderable: boolean = true;

    positionStates: PositionStates;
    rotationStates: RotationStates;

    debug: ObjectDebug;

    animations: Map<string, Animation>;
    active?: boolean;
    collisionRadius: number;

    constructor(
        id: number,
        pos: Point,
        rotation: number,
        collisionRadius: number,
        visualScale: number = collisionRadius
    ) {
        this.container = new Container();
        this.container.zIndex = 0;

        this.id = id;
        this.collisionRadius = collisionRadius;

        this.debug = createObjectDebug({
            id,
            position: pos,
            collisionRadius,
        });

        this.container.position = pos;
        this.size = visualScale;

        this.positionStates = new PositionStates(() => {
            this.container.renderable = true;
            this.debug.renderable = true;
        });
        this.positionStates.set({
            x: pos.x,
            y: pos.y,
        });

        this.rotationStates = new RotationStates();
        this.rotationStates.snap(rotation);
        this.container.rotation = rotation;

        this.animations = new Map();
    }

    get containers(): Container[] {
        return [this.container];
    }

    set renderable(value: boolean) {
        this._renderable = value;
        for (const container of this.containers) {
            container.renderable = value;
        }
    }

    get renderable() {
        return this._renderable;
    }

    /** Return true if object is done interpolating */
    update(_now?: number): boolean {
        const { x, y } = this.positionStates.interpolate();
        const rot = this.rotationStates.interpolate();

        this.position.set(x, y);
        this.container.rotation = rot;

        this.debug.sync(x, y, `${round(x)}, ${round(y)}`);

        return (
            this.positionStates.isComplete() &&
            this.rotationStates.isComplete()
        );
    }

    addPosition(state: PositionState): void {
        this.positionStates.set(state);
    }

    addRotation(radians: RotationState): void {
        this.rotationStates.set(radians);
    }

    /** Trigger an animation state */
    trigger(id: string, manager: AnimationManager, replace: boolean = false) {
        if (!this.animations) {
            return;
        }
        const animation = this.animations.get(id);
        if (animation) {
            manager.set(this, id, animation.run(), replace);
        }
    }

    get rotation() {
        return this.container.rotation;
    }

    set rotation(value) {
        this.container.rotation = value;
    }

    get position() {
        return this.container.position;
    }

    set size(value: number) {
        this.container.scale.set(value);
    }

    get size() {
        return this.container.scale._x;
    }
}
