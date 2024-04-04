import * as PIXI from "pixi.js";
import { radians, lerp, colorLerp } from "../../lib/transforms";
import { Keyframes, AnimationManager, AnimationMap } from "../../lib/animation";
import { itemConfigs } from "../configs/item_configs";
import { WorldObject } from "./world_object";
import { SpriteFactory } from "../assets/sprite_factory";
import random from "../../lib/random";
import { z } from "zod";
import { validate } from "../../shared/type_guard";
import { ANIMATION } from "./animations";

const Gear = z.tuple([
    z.string(), // mainHand
    z.string(), // offHand
    z.string(), // helmet
    z.number(), // backpack
]);
type PlayerParts = {
    body: {
        container: PIXI.Container;
        sprite: PIXI.Sprite;
        helmet: PIXI.Sprite;
    };
    leftHand: {
        container: PIXI.Container;
        sprite: PIXI.Sprite;
        item: PIXI.Sprite;
    };
    rightHand: {
        container: PIXI.Container;
        sprite: PIXI.Sprite;
        item: PIXI.Sprite;
    };
};

export class Player extends WorldObject {
    sprite: PlayerParts;
    name: string;

    animations: AnimationMap<Player>;

    mainHand: string;
    offHand: string;
    helmet: string;
    backpack: number;

    blocking: boolean;
    constructor(
        id: number,
        manager: AnimationManager,
        name: string,
        pos: PIXI.Point,
        rotation: number
    ) {
        super(id, pos, rotation, 15);
        this.sprite = {
            body: {
                container: new PIXI.Container(),
                sprite: SpriteFactory.build("player"),
                helmet: SpriteFactory.build(""),
            },
            leftHand: {
                container: new PIXI.Container(),
                sprite: SpriteFactory.build("hand"),
                item: SpriteFactory.build(""),
            },
            rightHand: {
                container: new PIXI.Container(),
                sprite: SpriteFactory.build("hand"),
                item: SpriteFactory.build(""),
            },
        };

        this.rotationProperties.speed = 5;
        this.name = name;

        this.offHand = "";
        this.mainHand = "";
        this.helmet = "";
        this.backpack = -1;

        this.blocking = false;

        this.pivot.x = this.width / 2;
        this.pivot.y = this.height / 2 + 15;
        this.zIndex = 1;

        const body = this.sprite.body;
        const leftHand = this.sprite.leftHand;
        const rightHand = this.sprite.rightHand;

        leftHand.item.renderable = false;
        rightHand.item.renderable = false;

        this.addChild(body.container);

        body.container.addChild(leftHand.container);
        body.container.addChild(rightHand.container);
        body.container.addChild(body.sprite);

        leftHand.container.addChild(leftHand.item);
        leftHand.container.addChild(leftHand.sprite);

        rightHand.container.addChild(rightHand.item);
        rightHand.container.addChild(rightHand.sprite);

        body.container.addChild(body.helmet);

        body.sprite.anchor.set(0.5);
        body.sprite.scale.set(0.9);
        body.helmet.anchor.set(0.5);

        leftHand.container.x = -70;
        leftHand.container.y = 45;
        leftHand.sprite.anchor.set(0.5);
        leftHand.container.pivot.set(300, 0);
        leftHand.container.scale.set(0.5);
        leftHand.sprite.scale.set(0.5);

        leftHand.item.anchor.set(1);
        leftHand.item.scale.set(1.8);

        rightHand.container.x = 70;
        rightHand.container.y = 45;
        rightHand.container.pivot.set(-300, 0);
        rightHand.sprite.anchor.set(0.5);
        rightHand.container.scale.set(0.5);
        rightHand.sprite.scale.set(0.5);

        rightHand.item.anchor.set(1);
        rightHand.item.scale.set(1.8);
        this.animations = loadAnimations(this);
        this.trigger(ANIMATION.LEFT_HAND, manager);
        this.trigger(ANIMATION.RIGHT_HAND, manager);

        this.selectItem({
            main: "amethyst_spear",
            off: "amethyst_sword",
            body: "amethyst_helmet",
        });
    }

    selectItem({
        main,
        off,
        body,
    }: {
        main?: string;
        off?: string;
        body?: string;
    }) {
        if (main) {
            this.mainHand = main;
        }
        if (off) {
            this.offHand = off;
        }
        if (body) {
            this.helmet = body;
        }
        this.updateGear();
    }

    setGear(gear?: typeof Gear) {
        if (validate(gear, Gear)) {
            this.mainHand = gear[0];
            this.offHand = gear[1];
            this.helmet = gear[2];
            this.backpack = gear[3];
            this.updateGear();
        }
    }

    updateGear() {
        this.sprite.rightHand.item.renderable = false;
        this.sprite.leftHand.item.renderable = false;
        this.sprite.body.helmet.renderable = false;

        if (this.mainHand !== "") {
            this.sprite.leftHand.item.renderable = true;
            const config = itemConfigs.get(this.mainHand);
            if (!config) {
                return;
            }
            SpriteFactory.update(
                this.sprite.leftHand.item,
                config.hand_display,
                this.mainHand
            );
        }

        if (this.offHand !== "") {
            this.sprite.rightHand.item.renderable = true;
            const config = itemConfigs.get(this.offHand);
            if (!config) {
                return;
            }
            SpriteFactory.update(
                this.sprite.rightHand.item,
                config.hand_display,
                this.offHand
            );
            this.sprite.rightHand.item.x = -this.sprite.rightHand.item.x;
        }

        if (this.helmet !== "") {
            this.sprite.body.helmet.renderable = true;
            const config = itemConfigs.get(this.helmet);
            if (!config) {
                return;
            }
            SpriteFactory.update(
                this.sprite.body.helmet,
                config.body_display,
                this.helmet
            );
        }
    }
}

function loadAnimations(target: Player) {
    let leftHandKeyframes: Keyframes<Player> = new Keyframes();
    leftHandKeyframes.frame(0).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        if (animation.firstKeyframe) {
            animation.meta.x = leftHand.x;
            animation.goto(0, 2000);
        }

        leftHand.x = animation.meta.x + Math.cos(animation.t * Math.PI * 2) * 5;
        if (animation.keyframeEnded) {
            animation.goto(0, 2000);
        }
    };

    let rightHandKeyframes: Keyframes<Player> = new Keyframes();
    rightHandKeyframes.frame(0).set = ({ target, animation }) => {
        const rightHand = target.sprite.rightHand.container;
        if (animation.firstKeyframe) {
            animation.meta.x = rightHand.x;
            animation.goto(0, 2000);
        }

        rightHand.x =
            animation.meta.x - Math.cos(animation.t * Math.PI * 2) * 5;
        if (animation.keyframeEnded) {
            animation.goto(0, 2000);
        }
    };

    const attackKeyframes: Keyframes<Player> = new Keyframes();
    attackKeyframes.frame(0).set = ({ target, animation }) => {
        animation.meta.targetHand = random.integer(0, 1);
        if (target.mainHand) {
            animation.meta.targetHand = 1;
        }
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        if (leftHand.rotation !== 0) {
            leftHand.rotation = 0;
            rightHand.rotation = 0;
        }
        animation.next(100);
    };
    attackKeyframes.frame(1).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        if (animation.meta.targetHand) {
            leftHand.rotation = lerp(radians(0), radians(-90), animation.t);
            rightHand.rotation = lerp(radians(0), radians(-15), animation.t);
        } else {
            rightHand.rotation = lerp(radians(0), radians(90), animation.t);
            leftHand.rotation = lerp(radians(0), radians(15), animation.t);
        }
        if (animation.keyframeEnded) {
            animation.next(200);
        }
    };
    attackKeyframes.frame(2).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        if (animation.meta.targetHand) {
            leftHand.rotation = lerp(radians(-90), radians(0), animation.t);
            rightHand.rotation = lerp(radians(-15), radians(0), animation.t);
        } else {
            rightHand.rotation = lerp(radians(90), radians(0), animation.t);
            leftHand.rotation = lerp(radians(15), radians(0), animation.t);
        }
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const blockKeyframes: Keyframes<Player> = new Keyframes();
    blockKeyframes.frame(0).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        if (leftHand.rotation !== 0) {
            animation.expired = true;
        }
        animation.next(75);
    };
    blockKeyframes.frame(1).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        leftHand.rotation = lerp(radians(0), radians(-90), animation.t);
        rightHand.rotation = lerp(radians(0), radians(25), animation.t);
        if (!target.blocking) {
            animation.next(60);
        }
    };
    blockKeyframes.frame(2).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        leftHand.rotation = lerp(radians(-90), radians(0), animation.t);
        rightHand.rotation = lerp(radians(25), radians(0), animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const hurtKeyframes: Keyframes<Player> = new Keyframes();
    hurtKeyframes.frame(0).set = ({ animation }) => {
        if (animation.firstKeyframe) {
            animation.goto(0, 100);
        }
        const color = colorLerp(0xffffff, 0xff0000, animation.t);
        target.sprite.body.sprite.tint = color;
        target.sprite.leftHand.sprite.tint = color;
        target.sprite.rightHand.sprite.tint = color;
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };
    hurtKeyframes.frame(1).set = ({ target, animation }) => {
        const color = colorLerp(0xff0000, 0xffffff, animation.t);
        target.sprite.body.sprite.tint = color;
        target.sprite.leftHand.sprite.tint = color;
        target.sprite.rightHand.sprite.tint = color;
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };
    const animations: AnimationMap<Player> = new AnimationMap(target);
    animations.set(ANIMATION.LEFT_HAND, leftHandKeyframes);
    animations.set(ANIMATION.RIGHT_HAND, rightHandKeyframes);
    animations.set(ANIMATION.ATTACK, attackKeyframes);
    animations.set(ANIMATION.BLOCK, blockKeyframes);
    animations.set(ANIMATION.HURT, hurtKeyframes);

    return animations;
}
