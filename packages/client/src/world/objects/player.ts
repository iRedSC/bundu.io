import { radians, lerp } from "@bundu/shared/transforms";
import { spriteConfigs } from "../../configs/sprite_configs";
import { SpriteFactory, ContaineredSprite } from "../../assets/sprite_factory";
import { random, Animation, AnimationManager } from "@bundu/shared";
import { ANIMATION, easeIn, easeOut, hurt } from "../../animation/animations";
import { Container, Point, Text } from "pixi.js";
import GameObject from "../game_object";
import { getStringId } from "@bundu/shared/id_map";

type nullish = undefined | null;
export interface Equipment {
    mainhand: number | nullish;
    offhand: number | nullish;
    helmet: number | nullish;
    backpack: boolean | nullish;
}

type PlayerParts = {
    structure: {
        container: Container;
        sprite: ContaineredSprite;
    };
    body: {
        container: Container;
        sprite: ContaineredSprite;
        helmet: ContaineredSprite;
    };
    leftHand: {
        container: Container;
        sprite: ContaineredSprite;
        item: ContaineredSprite;
    };
    rightHand: {
        container: Container;
        sprite: ContaineredSprite;
        item: ContaineredSprite;
    };
};

export class Player extends GameObject {
    sprite: PlayerParts;
    name: Text;

    mainhand?: string;
    offhand?: string;
    helmet?: string;
    backpack?: boolean;

    blocking: boolean;
    constructor(
        id: number,
        manager: AnimationManager,
        name: Text,
        pos: Point,
        rotation: number,
        collisionRadius: number
    ) {
        super(id, pos, rotation, collisionRadius, 100);
        this.sprite = {
            structure: {
                container: new Container(),
                sprite: SpriteFactory.build(""),
            },
            body: {
                container: new Container(),
                sprite: SpriteFactory.build("player"),
                helmet: SpriteFactory.build(""),
            },
            leftHand: {
                container: new Container(),
                sprite: SpriteFactory.build("hand"),
                item: SpriteFactory.build("diamond_sword"),
            },
            rightHand: {
                container: new Container(),
                sprite: SpriteFactory.build("hand"),
                item: SpriteFactory.build(""),
            },
        };

        this.name = name;
        this.name.scale.set(0.34);
        this.name.roundPixels = true;

        this.name.anchor.set(0.5, 2);
        this.name.zIndex = 100;

        this.offhand = "";
        this.mainhand = "";
        this.helmet = "";
        this.backpack = false;

        this.blocking = false;

        // this.container.pivot.x = this.container.width / 2;
        // this.container.pivot.y = this.container.height / 2 + 15;
        // this.container.pivot.y = -0.1;
        this.container.zIndex = 1;

        const structure = this.sprite.structure;
        const body = this.sprite.body;
        const leftHand = this.sprite.leftHand;
        const rightHand = this.sprite.rightHand;

        structure.sprite.renderable = false;
        leftHand.item.renderable = false;
        rightHand.item.renderable = false;

        this.container.addChild(leftHand.container);
        this.container.addChild(rightHand.container);
        this.container.addChild(body.container);
        this.container.addChild(structure.container);

        structure.sprite.alpha = 0.5;
        structure.container.addChild(structure.sprite);
        structure.sprite.anchor.set(0.5);
        structure.container.pivot.set(0, -1 * structure.sprite.scale.x);

        body.container.addChild(body.sprite);

        leftHand.container.addChild(leftHand.item);
        leftHand.container.addChild(leftHand.sprite);

        rightHand.container.addChild(rightHand.item);
        rightHand.container.addChild(rightHand.sprite);

        body.container.addChild(body.helmet);

        body.sprite.anchor.set(0.5);
        // body.sprite.scale.set(0.9);
        body.helmet.anchor.set(0.5);

        // leftHand.container.x = -0.05;
        leftHand.sprite.anchor.set(0.5);
        leftHand.container.pivot.set(1, 0);
        leftHand.container.scale.set(0.5);
        leftHand.sprite.scale.set(0.5);

        // leftHand.item.anchor.set(1);
        leftHand.item.scale.set(5);

        // rightHand.container.x = 0.05;
        rightHand.container.pivot.set(-1, 0);
        rightHand.sprite.anchor.set(0.5);
        rightHand.container.scale.set(0.5);
        rightHand.sprite.scale.set(0.5);

        rightHand.item.anchor.set(1);
        rightHand.item.scale.set(1.8);
        this.animations.set(
            ANIMATION.IDLE_HANDS,
            PlayerAnimations.idleHands(
                this.sprite.leftHand.container,
                this.sprite.rightHand.container,
                this.sprite.body.container
            )
        );
        this.animations.set(
            ANIMATION.HURT,
            hurt([rightHand.sprite, leftHand.sprite, body.sprite])
        );
        this.animations.set(ANIMATION.ATTACK, PlayerAnimations.attack(this));
        this.animations.set(ANIMATION.BLOCK, PlayerAnimations.block(this));
        this.trigger(ANIMATION.IDLE_HANDS, manager);

        this.positionStates.callback = () => {
            this.name.renderable = true;
            this.container.renderable = true;
            this.debug.renderable = true;
        };
    }

    override get containers(): Container[] {
        return [this.container, this.name];
    }

    override update(now: number): boolean {
        const done = super.update(now);
        this.name.position = this.position;
        return done;
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
            this.mainhand = main;
        }
        if (off) {
            this.offhand = off;
        }
        if (body) {
            this.helmet = body;
        }
        this.updateEquipment();
    }

    setEquipment(equipment?: Equipment) {
        if (!equipment) return;
        this.mainhand = getStringId(equipment.mainhand);
        this.offhand = getStringId(equipment.offhand);
        this.helmet = getStringId(equipment.helmet);
        this.backpack = equipment.backpack ?? undefined;
        this.updateEquipment();
    }

    updateEquipment() {
        this.sprite.rightHand.item.renderable = false;
        this.sprite.leftHand.item.renderable = false;
        this.sprite.body.helmet.renderable = false;

        if (this.mainhand) {
            this.sprite.leftHand.item.renderable = true;
            const config = spriteConfigs.get(this.mainhand);
            if (!config) {
                return;
            }
            SpriteFactory.update(
                this.sprite.leftHand.item,
                config.hand_display,
                this.mainhand
            );
            console.log(this.sprite.leftHand.item.position);
        }

        if (this.offhand) {
            this.sprite.rightHand.item.renderable = true;
            const config = spriteConfigs.get(this.offhand);
            if (!config) {
                return;
            }
            SpriteFactory.update(
                this.sprite.rightHand.item,
                config.hand_display,
                this.offhand
            );
            this.sprite.rightHand.item.x = -this.sprite.rightHand.item.x;
        }

        if (this.helmet) {
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

    setSelectedStructure(id: number, visualScale: number) {
        this.sprite.structure.sprite.renderable = false;
        const name = getStringId(id);
        if (!name) return;

        const config = spriteConfigs.get(name);
        if (!config) return;

        this.sprite.structure.sprite.renderable = true;
        const worldDisplay = {
            ...config.world_display,
            scale: visualScale,
        };
        SpriteFactory.update(
            this.sprite.structure.sprite,
            worldDisplay,
            name
        );
    }
}

namespace PlayerAnimations {
    const IDLE_WAVE_DISTANCE = 0.01;
    export function idleHands(
        left: Container,
        right: Container,
        body: Container
    ) {
        const leftX = left.x;
        const rightX = right.x;
        const bodyY = body.y;

        const animation = new Animation();
        animation.keyframes[0] = (animation) => {
            if (animation.isFirstKeyframe) {
                animation.goto(0, 2000);
            }

            left.x =
                leftX +
                Math.cos(animation.t * Math.PI * 2) * IDLE_WAVE_DISTANCE;
            right.x =
                rightX -
                Math.cos(animation.t * Math.PI * 2) * IDLE_WAVE_DISTANCE;
            body.y =
                bodyY +
                Math.sin(animation.t * Math.PI * 2) * IDLE_WAVE_DISTANCE;
            if (animation.keyframeEnded) {
                animation.goto(0, random.integer(1500, 2500));
            }
        };
        return animation;
    }

    export function attack(target: Player) {
        let targetHand: number;
        const body = target.sprite.body.container;
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;

        const animation = new Animation();
        animation.keyframes[0] = (animation) => {
            if (target.blocking) {
                return;
            }
            targetHand = !(target.mainhand === "" && target.offhand === "")
                ? 1
                : random.integer(0, 1);
            if (leftHand.rotation !== 0) {
                leftHand.rotation = 0;
                rightHand.rotation = 0;
            }
            animation.next(125);
        };
        animation.keyframes[1] = (animation) => {
            const t = easeOut(animation.t);
            if (targetHand) {
                leftHand.rotation = lerp(radians(0), radians(-100), t);
                rightHand.rotation = lerp(radians(0), radians(-10), t);
                body.rotation = lerp(radians(0), radians(-25), t);
            } else {
                rightHand.rotation = lerp(radians(0), radians(100), t);
                leftHand.rotation = lerp(radians(0), radians(10), t);
                body.rotation = lerp(radians(0), radians(25), t);
            }
            if (animation.keyframeEnded) {
                animation.next(275);
            }
        };
        animation.keyframes[2] = (animation) => {
            const t = easeIn(animation.t);
            if (targetHand) {
                leftHand.rotation = lerp(radians(-100), radians(0), t);
                rightHand.rotation = lerp(radians(-10), radians(0), t);
                body.rotation = lerp(radians(-25), radians(0), t);
            } else {
                rightHand.rotation = lerp(radians(100), radians(0), t);
                leftHand.rotation = lerp(radians(10), radians(0), t);
                body.rotation = lerp(radians(25), radians(0), t);
            }
            if (animation.keyframeEnded) {
                animation.expired = true;
            }
        };
        animation.cleanup = () => {
            leftHand.rotation = 0;
            rightHand.rotation = 0;
            body.rotation = 0;
        };
        return animation;
    }

    export function block(target: Player) {
        const body = target.sprite.body.container;
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        let bodyRot = 0;
        let leftHandRot = 0;
        let rightHandRot = 0;

        const animation = new Animation();
        animation.keyframes[0] = (animation) => {
            bodyRot = target.sprite.body.container.rotation;
            leftHandRot = target.sprite.leftHand.container.rotation;
            rightHandRot = target.sprite.rightHand.container.rotation;
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
                radians(45),
                animation.t
            );

            body.rotation = lerp(radians(bodyRot), radians(15), animation.t);
            if (!target.blocking) {
                animation.next(60);
            }
        };
        animation.keyframes[2] = (animation) => {
            leftHand.rotation = lerp(radians(-90), radians(0), animation.t);
            rightHand.rotation = lerp(radians(45), radians(0), animation.t);
            body.rotation = lerp(radians(15), radians(0), animation.t);
            if (animation.keyframeEnded) {
                animation.expired = true;
            }
        };
        animation.cleanup = () => {
            leftHand.rotation = leftHandRot;
            rightHand.rotation = rightHandRot;
            body.rotation = bodyRot;
        };
        return animation;
    }
}
