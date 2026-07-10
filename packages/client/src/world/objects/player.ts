import { spriteConfigs } from "../../configs/sprite_configs";
import { SpriteFactory, ContaineredSprite } from "../../assets/sprite_factory";
import { ANIMATION, hurt } from "../../animation/animations";
import { AnimationManager } from "../../animation/runtime";
import { Container, Point, Text } from "pixi.js";
import GameObject from "../game_object";
import { getStringId } from "@bundu/shared/id_map";
import { PlayerAnimations } from "./player_animations";

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
            const config = spriteConfigs.get(this.mainhand);
            if (config) {
                this.sprite.leftHand.item.renderable = true;
                SpriteFactory.update(
                    this.sprite.leftHand.item,
                    config.hand_display,
                    this.mainhand
                );
            }
        }

        if (this.offhand) {
            const config = spriteConfigs.get(this.offhand);
            if (config) {
                this.sprite.rightHand.item.renderable = true;
                SpriteFactory.update(
                    this.sprite.rightHand.item,
                    config.hand_display,
                    this.offhand
                );
                this.sprite.rightHand.item.x = -this.sprite.rightHand.item.x;
            }
        }

        if (this.helmet) {
            const config = spriteConfigs.get(this.helmet);
            if (config) {
                this.sprite.body.helmet.renderable = true;
                SpriteFactory.update(
                    this.sprite.body.helmet,
                    config.body_display,
                    this.helmet
                );
            }
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
