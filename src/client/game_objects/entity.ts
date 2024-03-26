import * as PIXI from "pixi.js";
import { colorLerp, degrees } from "../../lib/transforms";
import { AnimationManager, AnimationMap, Keyframes } from "../../lib/animation";
import Random from "../../lib/random";
import { WorldObject } from "./world_object";
import { assets } from "../assets/load";

enum ENTITY_ANIMATION {
    IDLE = 0,
    HURT = 1,
}

export class Entity extends WorldObject {
    sprite: PIXI.Sprite;
    animations: AnimationMap<Entity>;

    constructor(
        manager: AnimationManager,
        type: string,
        pos: PIXI.Point,
        rotation: number,
        size: number
    ) {
        super(pos, rotation);

        this.scale.set(size);
        this.pivot.set(this.width / 2, this.height / 2);

        this.sprite = new PIXI.Sprite(assets(type));
        this.sprite.rotation = degrees(-90);
        this.sprite.anchor.set(0.5);

        this.animations = loadAnimations(this);
        this.trigger(ENTITY_ANIMATION.IDLE, manager);

        this.addChild(this.sprite);
    }
}

function loadAnimations(target: Entity) {
    const idleKeyframes: Keyframes<Entity> = new Keyframes();
    idleKeyframes.frame(0).set = ({ target, animation }) => {
        animation.meta.width = target.scale.x;
        animation.meta.height = target.scale.y;
        animation.meta.frameLength = Random.integer(1000, 2000);

        animation.next(animation.meta.frameLength);
    };

    idleKeyframes.frame(1).set = ({ target, animation }) => {
        target.scale.x =
            animation.meta.width + Math.cos(animation.t * Math.PI * 2) * 0.06;
        target.scale.y =
            animation.meta.height - Math.cos(animation.t * Math.PI * 2) * 0.11;
        if (animation.keyframeEnded) {
            animation.goto(1, animation.meta.frameLength);
        }
    };

    const hurtKeyframes: Keyframes<Entity> = new Keyframes();
    hurtKeyframes.frame(0).set = ({ animation }) => {
        if (animation.firstKeyframe) {
            animation.goto(0, 100);
        }
        target.sprite.tint = colorLerp(0xffffff, 0xff0000, animation.t);
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };
    hurtKeyframes.frame(1).set = ({ target, animation }) => {
        target.sprite.tint = colorLerp(0xff0000, 0xffffff, animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const animationMap = new AnimationMap(target);

    animationMap.set(ENTITY_ANIMATION.IDLE, idleKeyframes);
    animationMap.set(ENTITY_ANIMATION.HURT, hurtKeyframes);
    return animationMap;
}
