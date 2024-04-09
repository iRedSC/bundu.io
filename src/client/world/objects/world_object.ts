import * as PIXI from "pixi.js";
import { rotationLerp } from "../../../lib/transforms";
import { Line } from "../debug/line";
import { DebugWorldObject } from "../../debug";
import { Circle } from "../debug/circle";
import { TEXT_STYLE } from "../../assets/text";
import { Animation, AnimationManager } from "../../../lib/animations";
import { States } from "../states";
import { RotationHandler } from "../rotation";

// TODO: There are too many properties related to rotation clogging up the object.

/**
 * The base object for rendering something in the world.
 * Contains states for interpolating movement
 * Separate system for interpolating rotation
 */
export class WorldObject extends PIXI.Container {
    id: number;
    private _size?: number;
    states: States;
    rotationProperties: RotationHandler;
    debug: DebugWorldObject;

    animations?: Map<number, Animation>;

    constructor(id: number, pos: PIXI.Point, rotation: number, size: number) {
        super();

        this.id = id;

        this.debug = new DebugWorldObject();
        this.position = pos;
        this.rotation = rotation;
        this.states = new States(() => {
            this.renderable = true;
            this.debug.renderable = true;
        });
        this.states.set([Date.now(), pos.x, pos.y]);
        this.rotationProperties = new RotationHandler(true, 100);
        this.setRotation(rotation);
        this.size = size;

        const idText = new PIXI.Text(`ID: ${this.id}`, TEXT_STYLE);
        idText.scale.set(5);
        idText.position = pos;
        this.debug.update("id", idText);
    }

    move() {
        const now = Date.now() - 50;

        const [x, y] = this.states.interpolate(now);
        this.position.set(x, y);

        if (this.rotationProperties._interpolate) {
            this.rotation = this.rotationProperties.interpolate(now);
        }

        this.debug.containers.get("hitbox")?.position.set(x, y);
        this.debug.containers.get("id")?.position.set(x, y);
    }

    setRotation(rotation: number) {
        this.rotationProperties.set(this.rotation, rotation);
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
        this.debug.update("hitbox", hitbox);
    }

    get size() {
        return this._size || 0;
    }
}
