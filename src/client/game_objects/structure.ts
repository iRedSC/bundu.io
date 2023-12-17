import * as PIXI from "pixi.js";
import { degrees, lerp, lookToward, moveToward } from "../../lib/transforms";
import { AnimationMap, Keyframes } from "../../lib/animation";
import { WorldObject } from "./world_object";
import { assets } from "../assets/load";
// type StructureData = [id: number, pos: number, size: number, rotation: number];
enum STRUCTURE_ANIMATION {
    HIT = 0,
}
export class Structure extends WorldObject {
    sprite: PIXI.Sprite;
    animations: AnimationMap<Structure>;
    lastHitSource: PIXI.Point;

    constructor(type: string, pos: PIXI.Point, rotation: number, size: number) {
        super(pos, rotation);
        console.log(type);
        console.log(assets);
        this.sprite = new PIXI.Sprite(assets(type));
        this.lastHitSource = new PIXI.Point(0, 0);

        this.zIndex = 10;
        this.pivot.set(this.width / 2, this.height / 2);
        this.sprite.rotation = rotation - degrees(-90);
        this.sprite.anchor.set(0.5);
        this.addChild(this.sprite);

        this.rotation = rotation;
        this.scale.set(size);

        this.animations = loadAnimations(this);
    }
}

function loadAnimations(target: Structure) {
    const hitKeyframes: Keyframes<Structure> = new Keyframes();
    hitKeyframes.frame(0).set = ({ target, animation }) => {
        if (animation.firstKeyframe) {
            animation.meta.x = target.x;
            animation.meta.y = target.y;
            animation.goto(0, 100);
        }
        const targetPos = moveToward(
            target.position,
            lookToward(target.lastHitSource, target.position),
            50
        );
        target.x = lerp(animation.meta.x, targetPos.x, animation.t);
        target.y = lerp(animation.meta.y, targetPos.y, animation.t);
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };
    hitKeyframes.frame(1).set = ({ target, animation }) => {
        target.x = lerp(target.x, animation.meta.x, animation.t);
        target.y = lerp(target.y, animation.meta.y, animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const animationMap = new AnimationMap(target);

    animationMap.set(STRUCTURE_ANIMATION.HIT, hitKeyframes);
    return animationMap;
}
