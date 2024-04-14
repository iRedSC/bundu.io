import * as PIXI from "pixi.js";
import { radians } from "../../../lib/transforms";
import Random from "../../../lib/random";
import { WorldObject } from "./world_object";
import { assets } from "../../assets/load";
import { Animation, AnimationManager } from "../../../lib/animations";
import { ANIMATION, hurt } from "../../animation/animations";

export class Entity extends WorldObject {
    sprite: PIXI.Sprite;

    constructor(
        id: number,
        manager: AnimationManager,
        type: string,
        pos: PIXI.Point,
        rotation: number,
        size: number
    ) {
        super(id, pos, rotation, size);

        this.container.pivot.set(
            this.container.width / 2,
            this.container.height / 2
        );

        this.sprite = new PIXI.Sprite(assets(type));
        this.sprite.rotation = radians(-90);
        this.sprite.anchor.set(0.5);

        this.animations.set(ANIMATION.ENTITY_IDLE, entityIdle(this));
        this.animations.set(ANIMATION.HURT, hurt([this.sprite]));
        this.trigger(ANIMATION.ENTITY_IDLE, manager);

        this.container.addChild(this.sprite);
    }
}

function entityIdle(target: Entity) {
    let width: number;
    let height: number;

    let frameLength: number;
    const animation = new Animation(ANIMATION.ENTITY_IDLE);
    animation.keyframes[0] = (animation) => {
        width = target.container.scale.x;
        height = target.container.scale.y;
        frameLength = Random.integer(1000, 2000);

        animation.next(frameLength);
    };

    animation.keyframes[1] = (animation) => {
        target.container.scale.x =
            width + Math.cos(animation.t * Math.PI * 2) * 0.06;
        target.container.scale.y =
            height - Math.cos(animation.t * Math.PI * 2) * 0.11;
        if (animation.keyframeEnded) {
            animation.goto(1, frameLength);
        }
    };
    return animation;
}
