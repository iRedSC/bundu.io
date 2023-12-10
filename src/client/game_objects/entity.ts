import * as PIXI from "pixi.js";
import { colorLerp, degrees } from "../../lib/transforms";
import { AnimationManager, AnimationMap, Keyframes } from "../../lib/animation";
import { Random } from "../../lib/random";
import { WorldObject } from "./world_object";

type EntityParts = {
    container: PIXI.Container;
    body: PIXI.Sprite;
};

export class Entity extends WorldObject {
    pos: PIXI.Point;
    rotation: number;
    size: number;
    animations: AnimationMap<Entity>;
    animationManager: AnimationManager;
    constructor(
        animationManager: AnimationManager,
        type: string,
        pos: { x: number; y: number },
        rotation: number
    ) {
        const sprite: EntityParts = {
            container: new PIXI.Container(),
            body: PIXI.Sprite.from(`./assets/${type}.svg`, {
                mipmap: PIXI.MIPMAP_MODES.ON,
            }),
        };
        super(pos, rotation, sprite);
        this.animationManager = animationManager;

        this.pos = new PIXI.Point(0, 0);
        this.rotation = 0;
        this.size = 5;
        this.sprite.container.pivot.set(
            this.sprite.container.width / 2,
            this.sprite.container.height / 2
        );
        this.sprite.container.position.set(this.pos.x, this.pos.y);
        this.sprite.body = PIXI.Sprite.from(`./assets/${type}.svg`, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });
        this.sprite.body.rotation = degrees(-90);
        this.sprite.body.anchor.set(0.5);
        this.sprite.container.addChild(this.sprite.body);
        this.sprite.body.scale.set(this.size);
        this.animations = loadAnimations(this);
        this.trigger("idle");
    }
    trigger(name: string) {
        const animation = this.animations.get(name);
        if (animation !== undefined) {
            this.animationManager.add(this, animation.run());
        }
    }
    get container() {
        return this.sprite.container;
    }
}

function loadAnimations(target: Entity) {
    const idleKeyframes: Keyframes<Entity> = new Keyframes();
    idleKeyframes.frame(0).set = ({ target, animation }) => {
        animation.meta.width = target.container.scale.x;
        animation.meta.height = target.container.scale.y;
        animation.meta.frameLength = Random.integer(2000, 4000);

        animation.next(animation.meta.frameLength);
    };

    idleKeyframes.frame(1).set = ({ target, animation }) => {
        // console.log(animation);
        target.container.scale.x =
            animation.meta.width + Math.cos(animation.t * Math.PI * 2) * 0.02;
        target.container.scale.y =
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
        target.sprite.body.tint = colorLerp(0xffffff, 0xff0000, animation.t);
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };
    hurtKeyframes.frame(1).set = ({ target, animation }) => {
        target.sprite.body.tint = colorLerp(0xff0000, 0xffffff, animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const animationMap = new AnimationMap(target);

    animationMap.set("idle", idleKeyframes);
    animationMap.set("hurt", hurtKeyframes);
    return animationMap;
}
