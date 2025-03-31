import { rotationLerp } from "../../../lib/transforms";
import { Line } from "../debug/line";
import { DebugWorldObject } from "../../rendering/debug";
import { Circle } from "../debug/circle";
import { TEXT_STYLE } from "../../assets/text";
import { Animation, AnimationManager } from "../../../lib/animations";
import { States } from "../states";
import { RotationHandler } from "../rotation";
import { Container, Point, Text } from "pixi.js";
import { serverTime } from "../../globals";

// TODO: There are too many properties related to rotation clogging up the object.

/**
 * The base object for rendering something in the world.
 * Contains states for interpolating movement
 * Separate system for interpolating rotation
 */
export class WorldObject {
    container: Container;

    id: number;

    private _size?: number;
    private _renderable: boolean = true;
    private _rotation: number = 0;

    states: States;
    rotationProperties: RotationHandler;

    debug: DebugWorldObject;

    animations: Map<number, Animation>;
    active?: boolean;

    constructor(id: number, pos: Point, rotation: number, size: number) {
        this.container = new Container();
        this.container.zIndex = 0;

        this.id = id;

        this.debug = new DebugWorldObject();

        this.container.position = pos;
        this.size = size;

        this.states = new States(() => {
            this.container.renderable = true;
            this.debug.renderable = true;
        });
        this.states.set([serverTime.now(), pos.x, pos.y]);

        this.rotationProperties = new RotationHandler(true, 100);
        this._rotation = rotation;
        this.container.rotation = rotation;

        this.animations = new Map();

        const idText = new Text(`ID: ${this.id}`, TEXT_STYLE);
        idText.scale.set(0.34);
        idText.position = pos;
        this.debug.update("id", idText);

        const hitbox = new Circle(this.position, size / 10, 0xff0000, 2);
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

    update(now: number) {
        // if (!now) return true;
        const [x, y] = this.states.interpolate(now);
        this.position.set(x, y);
        // console.log(this.position);

        if (this.rotationProperties._interpolate) {
            this._rotation = this.rotationProperties.interpolate(now);
            this.container.rotation = this._rotation;
        }

        this.debug.containers.get("hitbox")?.position.set(x, y);
        this.debug.containers.get("id")?.position.set(x, y);

        const lastState = this.states.values.at(-1);
        if (!lastState) {
            return false;
        }
        if (this.states.values.at(-1)![0] < now) {
            return true;
        }
        return false;
    }

    trigger(id: number, manager: AnimationManager, replace: boolean = false) {
        if (!this.animations) {
            return;
        }
        const animation = this.animations.get(id);
        if (animation) {
            manager.set(this, id, animation.run(), replace);
        }
    }

    set rotation(rotation: number) {
        if (!this.rotationProperties._interpolate) {
            this._rotation = rotation;
            this.container.rotation = rotation;
            return;
        }
        this.rotationProperties.set(this._rotation, rotation);
    }

    get rotation() {
        return this.container.rotation;
    }

    get position() {
        return this.container.position;
    }

    set size(value: number) {
        this._size = value;
        this.container.scale.set(value * 2.5);
    }

    get size() {
        return this._size || 0;
    }
}
