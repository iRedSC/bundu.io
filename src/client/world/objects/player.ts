import * as PIXI from "pixi.js";
import { radians, lerp } from "../../../lib/transforms";
import { spriteConfigs } from "../../configs/sprite_configs";
import { WorldObject } from "./world_object";
import { SpriteFactory, SpriteWrapper } from "../../assets/sprite_factory";
import random from "../../../lib/random";
import { z } from "zod";
import { validate } from "../../../shared/type_guard";
import { ANIMATION, cubicBezier, hurt } from "../../animation/animations";
import { idMap } from "../../configs/id_map";
import { Animation, AnimationManager } from "../../../lib/animations";
import { TEXT_STYLE } from "../../assets/text";

const Gear = z.tuple([
    z.number(), // mainHand
    z.number(), // offHand
    z.number(), // helmet
    z.number(), // backpack
]);
type Gear = z.infer<typeof Gear>;
type PlayerParts = {
    body: {
        container: PIXI.Container;
        sprite: SpriteWrapper;
        helmet: SpriteWrapper;
    };
    leftHand: {
        container: PIXI.Container;
        sprite: SpriteWrapper;
        item: SpriteWrapper;
    };
    rightHand: {
        container: PIXI.Container;
        sprite: SpriteWrapper;
        item: SpriteWrapper;
    };
};

export class Player extends WorldObject {
    sprite: PlayerParts;
    name: PIXI.Text;

    mainHand: string;
    offHand: string;
    helmet: string;
    backpack: number;

    blocking: boolean;
    constructor(
        id: number,
        manager: AnimationManager,
        name: PIXI.Text,
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

        this.rotationProperties.duration = 5;
        this.name = name;

        this.name.anchor.set(0.5, 2);
        this.name.scale.set(3);

        this.offHand = "";
        this.mainHand = "";
        this.helmet = "";
        this.backpack = -1;

        this.blocking = false;

        this.container.pivot.x = this.container.width / 2;
        this.container.pivot.y = this.container.height / 2 + 15;
        this.container.zIndex = 1;

        const body = this.sprite.body;
        const leftHand = this.sprite.leftHand;
        const rightHand = this.sprite.rightHand;

        leftHand.item.renderable = false;
        rightHand.item.renderable = false;

        this.container.addChild(body.container);

        body.container.addChild(leftHand.container);
        body.container.addChild(rightHand.container);
        body.container.addChild(body.sprite);

        leftHand.container.addChild(leftHand.item);
        leftHand.container.addChild(leftHand.sprite);

        rightHand.container.addChild(rightHand.item);
        rightHand.container.addChild(rightHand.sprite);

        body.container.addChild(body.helmet);

        body.sprite.anchor.set(0.5);
        body.sprite.setScale(0.9);
        body.helmet.anchor.set(0.5);

        leftHand.container.x = -70;
        leftHand.container.y = 45;
        leftHand.sprite.anchor.set(0.5);
        leftHand.container.pivot.set(300, 0);
        leftHand.container.scale.set(0.5);
        leftHand.sprite.setScale(0.5);

        leftHand.item.anchor.set(1);
        leftHand.item.setScale(1.8);

        rightHand.container.x = 70;
        rightHand.container.y = 45;
        rightHand.container.pivot.set(-300, 0);
        rightHand.sprite.anchor.set(0.5);
        rightHand.container.scale.set(0.5);
        rightHand.sprite.setScale(0.5);

        rightHand.item.anchor.set(1);
        rightHand.item.setScale(1.8);
        this.animations.set(
            ANIMATION.IDLE_HANDS,
            PlayerAnimations.idleHands(
                this.sprite.leftHand.container,
                this.sprite.rightHand.container
            )
        );
        this.animations.set(
            ANIMATION.HURT,
            hurt([rightHand.sprite, leftHand.sprite, body.sprite])
        );
        this.animations.set(ANIMATION.ATTACK, PlayerAnimations.attack(this));
        this.animations.set(ANIMATION.BLOCK, PlayerAnimations.block(this));
        this.trigger(ANIMATION.IDLE_HANDS, manager);

        this.states.callback = () => {
            this.name.renderable = true;
            this.container.renderable = true;
            this.debug.renderable = true;
        };
    }

    interpolate(): void {
        super.interpolate();
        this.name.position = this.position;
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

    setGear(gear?: Gear) {
        if (validate(gear, Gear)) {
            this.mainHand = idMap.getv(gear[0]) || "";
            this.offHand = idMap.getv(gear[1]) || "";
            this.helmet = idMap.getv(gear[2]) || "";
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
            const config = spriteConfigs.get(this.mainHand);
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
            const config = spriteConfigs.get(this.offHand);
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
            const config = spriteConfigs.get(this.helmet);
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

namespace PlayerAnimations {
    export function idleHands(left: PIXI.Container, right: PIXI.Container) {
        const leftX = left.x;
        const rightX = right.x;

        const animation = new Animation(ANIMATION.IDLE_HANDS);
        animation.keyframes[0] = (animation) => {
            if (animation.isFirstKeyframe) {
                animation.goto(0, 2000);
            }

            left.x = leftX + Math.cos(animation.t * Math.PI * 2) * 5;
            right.x = rightX - Math.cos(animation.t * Math.PI * 2) * 5;
            if (animation.keyframeEnded) {
                animation.goto(0, 2000);
            }
        };
        return animation;
    }

    export function attack(target: Player) {
        const backwardTiming = cubicBezier(0.78, -0.01, 0.52, 0.99);
        const forwardTiming = cubicBezier(0, 0.74, 0.52, 0.99);
        let targetHand: number;
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;

        const animation = new Animation(ANIMATION.ATTACK);
        animation.keyframes[0] = (animation) => {
            if (target.blocking) {
                return;
            }
            targetHand = !(target.mainHand === "" && target.offHand === "")
                ? 1
                : random.integer(0, 1);
            if (leftHand.rotation !== 0) {
                leftHand.rotation = 0;
                rightHand.rotation = 0;
            }
            animation.next(150);
        };
        animation.keyframes[1] = (animation) => {
            const t = forwardTiming(animation.t);
            if (targetHand) {
                leftHand.rotation = lerp(radians(0), radians(-100), t);
                rightHand.rotation = lerp(radians(0), radians(-15), t);
            } else {
                rightHand.rotation = lerp(radians(0), radians(100), t);
                leftHand.rotation = lerp(radians(0), radians(15), t);
            }
            if (animation.keyframeEnded) {
                animation.next(150);
            }
        };
        animation.keyframes[2] = (animation) => {
            const t = backwardTiming(animation.t);
            if (targetHand) {
                leftHand.rotation = lerp(radians(-100), radians(0), t);
                rightHand.rotation = lerp(radians(-15), radians(0), t);
            } else {
                rightHand.rotation = lerp(radians(100), radians(0), t);
                leftHand.rotation = lerp(radians(15), radians(0), t);
            }
            if (animation.keyframeEnded) {
                animation.expired = true;
            }
        };
        animation.keyframes[-1] = () => {
            leftHand.rotation = 0;
            rightHand.rotation = 0;
        };
        return animation;
    }

    export function block(target: Player) {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        const leftHandRot = target.sprite.leftHand.container.rotation;
        const rightHandRot = target.sprite.rightHand.container.rotation;
        const animation = new Animation(ANIMATION.BLOCK);
        animation.keyframes[0] = (animation) => {
            animation.next(75);
        };
        animation.keyframes[1] = (animation) => {
            leftHand.rotation = lerp(
                radians(leftHandRot),
                radians(-90),
                animation.t
            );
            rightHand.rotation = lerp(
                radians(rightHandRot),
                radians(25),
                animation.t
            );
            if (!target.blocking) {
                animation.next(60);
            }
        };
        animation.keyframes[2] = (animation) => {
            leftHand.rotation = lerp(radians(-90), radians(0), animation.t);
            rightHand.rotation = lerp(radians(25), radians(0), animation.t);
            if (animation.keyframeEnded) {
                animation.expired = true;
            }
        };
        animation.keyframes[-1] = () => {
            leftHand.rotation = leftHandRot;
            rightHand.rotation = rightHandRot;
        };
        return animation;
    }
}
