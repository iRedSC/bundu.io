import * as PIXI from "pixi.js";
import {
    radians,
    lerp,
    lookToward,
    moveInDirection,
} from "../../lib/transforms";
import { WorldObject } from "./world_object";
import { assets } from "../assets/load";
import { ANIMATION } from "../animation/animations";
import { hit } from "../animation/animation_testing";
// type StructureData = [id: number, pos: number, size: number, rotation: number];

export class Structure extends WorldObject {
    sprite: PIXI.Sprite;
    lastHitSource: PIXI.Point;

    constructor(
        id: number,
        type: string,
        pos: PIXI.Point,
        rotation: number,
        size: number
    ) {
        super(id, pos, rotation, size);
        this.sprite = new PIXI.Sprite(assets(type));
        this.lastHitSource = new PIXI.Point(0, 0);

        this.zIndex = 10;
        this.pivot.set(this.width / 2, this.height / 2);
        this.sprite.rotation = rotation - radians(-90);
        this.sprite.anchor.set(0.5);
        this.addChild(this.sprite);

        this.rotation = rotation;

        this.animations = new Map();
        this.animations.set(ANIMATION.HURT, hit(this));
    }
}
