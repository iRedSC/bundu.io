import * as PIXI from "pixi.js";
import { colorLerp, degrees } from "../../lib/transforms";
import { AnimationManager, AnimationMap, Keyframes } from "../../lib/animation";
import { Random } from "../../lib/random";
import { WorldObject } from "./world_object";

export class Entity extends WorldObject {
    sprite: PIXI.Sprite;
    size: number;
    animations: AnimationMap<Entity>;
    constructor(
        manager: AnimationManager,
        type: string,
        pos: PIXI.Point,
        rotation: number
    ) {
        super(pos, rotation);
        this.sprite = PIXI.Sprite.from(`./assets/${type}.svg`, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });

        this.size = 5;
        this.pivot.set(this.width / 2, this.height / 2);
        this.sprite.rotation = degrees(-90);
        this.sprite.anchor.set(0.5);
        this.sprite.scale.set(this.size);
        this.animations = loadAnimations(this);
        this.trigger("idle", manager);
        this.addChild(this.sprite);
    }
    trigger(name: string, manager: AnimationManager) {
        const animation = this.animations.get(name);
        if (animation !== undefined) {
            manager.add(this, animation.run());
        }
    }
}

function loadAnimations(target: Entity) {
    const idleKeyframes: Keyframes<Entity> = new Keyframes();
    idleKeyframes.frame(0).set = ({ target, animation }) => {
        animation.meta.width = target.scale.x;
        animation.meta.height = target.scale.y;
        animation.meta.frameLength = Random.integer(2000, 4000);

        animation.next(animation.meta.frameLength);
    };

    idleKeyframes.frame(1).set = ({ target, animation }) => {
        // console.log(animation);
        target.scale.x =
            animation.meta.width + Math.cos(animation.t * Math.PI * 2) * 0.02;
        target.scale.y =
            animation.meta.height - Math.cos(animation.t * Math.PI * 2) * 0.03;
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

    animationMap.set("idle", idleKeyframes);
    animationMap.set("hurt", hurtKeyframes);
    return animationMap;
}
