import { DebugWorldObject } from "@client/rendering/debug";
import { Circle } from "./debug/circle";
import { TEXT_STYLE } from "@client/assets/text";
import { round } from "@bundu/shared";
import { Animation, AnimationManager } from "../animation/runtime";
import {
    PositionStates,
    RotationStates,
    type PositionState,
    type RotationState,
} from "./states";
import { Container, Point, Text } from "pixi.js";

/**
 * The base object for rendering something in the world.
 * Contains states for interpolating movement
 * Separate system for interpolating rotation
 */
export default class GameObject {
    container: Container;

    id: number;

    locationText: Text;
    private _renderable: boolean = true;

    positionStates: PositionStates;
    rotationStates: RotationStates;

    debug: DebugWorldObject;

    animations: Map<number, Animation>;
    active?: boolean;
    collisionRadius: number;

    constructor(
        id: number,
        pos: Point,
        rotation: number,
        collisionRadius: number,
        debugRoot: Container,
        visualScale: number = collisionRadius
    ) {
        this.container = new Container();
        this.container.zIndex = 0;

        this.id = id;
        this.collisionRadius = collisionRadius;

        this.debug = new DebugWorldObject(debugRoot);

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
        this.container.rotation = rotation;

        this.animations = new Map();

        const idText = new Text(`ID: ${this.id}`, TEXT_STYLE);
        idText.scale.set(0.34);
        idText.position = pos;
        this.debug.update("id", idText);

        this.locationText = new Text(
            ` ${this.position.x}, ${this.position.y}`,
            TEXT_STYLE
        );
        this.locationText.scale.set(0.34);
        this.locationText.position.set(pos.x, pos.y - 10);
        this.debug.update("location", this.locationText);

        const hitbox = new Circle(
            this.position,
            this.collisionRadius,
            0xff0000,
            2
        );
        this.debug.update("hitbox", hitbox);
    }

    get containers(): Container[] {
        // ...Array.from(this.debug.containers.values())
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
    update(now: number): boolean {
        const { x, y } = this.positionStates.interpolate(now);
        const rot = this.rotationStates.interpolate();

        this.position.set(x, y);
        this.container.rotation = rot;

        this.locationText.text = `${round(this.position.x)}, ${round(
            this.position.y
        )}`;

        this.locationText.position.set(x, y - 10);
        this.debug.containers.get("hitbox")?.position.set(x, y);
        this.debug.containers.get("id")?.position.set(x, y);

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
    trigger(id: number, manager: AnimationManager, replace: boolean = false) {
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
