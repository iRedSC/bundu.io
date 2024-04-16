import * as PIXI from "pixi.js";
import { rotationLerp } from "../../../lib/transforms";
import { Line } from "../debug/line";
import { DebugWorldObject } from "../../rendering/debug";
import { Circle } from "../debug/circle";
import { TEXT_STYLE } from "../../assets/text";
import { Animation, AnimationManager } from "../../../lib/animations";
import { States } from "../states";
import { RotationHandler } from "../rotation";
import { IDContainer } from "./id_container";

// TODO: There are too many properties related to rotation clogging up the object.

/**
 * The base object for rendering something in the world.
 * Contains states for interpolating movement
 * Separate system for interpolating rotation
 */
export class WorldObject {
    container: IDContainer;

    id: number;

    private _size?: number;

    states: States;
    rotationProperties: RotationHandler;

    debug: DebugWorldObject;

    animations: Map<number, Animation>;

    constructor(id: number, pos: PIXI.Point, rotation: number, size: number) {
        this.container = new IDContainer(id);

        this.id = id;

        this.debug = new DebugWorldObject();

        this.container.position = pos;
        this.size = size;

        this.states = new States(() => {
            this.container.renderable = true;
            this.debug.renderable = true;
        });
        this.states.set([Date.now(), pos.x, pos.y]);

        this.rotationProperties = new RotationHandler(true, 100);
        this.setRotation(rotation);

        this.animations = new Map();

        const idText = new PIXI.Text(`ID: ${this.id}`, TEXT_STYLE);
        idText.scale.set(5);
        idText.position = pos;
        this.debug.update("id", idText);
    }

    containers() {
        return [this.container];
    }

    interpolate() {
        const now = Date.now() - 50;

        const [x, y] = this.states.interpolate(now);
        this.position.set(x, y);

        if (this.rotationProperties._interpolate) {
            this.rotation = this.rotationProperties.interpolate(now);
            this.container.rotation = this.rotation;
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

    set rotation(value: number) {
        this.container.rotation = value;
    }

    get rotation() {
        return this.container.rotation;
    }

    get position() {
        return this.container.position;
    }

    set size(value: number) {
        this._size = value;
        this.container.scale.set(value / 15);

        const hitbox = new Circle(this.position, this._size, 0xff0000, 25);
        this.debug.update("hitbox", hitbox);
    }

    get size() {
        return this._size || 0;
    }
}
