import * as PIXI from "pixi.js";
import { radians } from "@bundu/shared";
import GameObject from "../game_object";
import { ANIMATION, hit } from "../../animation/animations";
import { spriteConfigs } from "@client/configs/sprite_configs";
import {
    SpriteFactory,
    ContaineredSprite,
} from "@client/assets/sprite_factory";
// Resource nodes use collision radius for physics/debug and visual scale for art.

export class Structure extends GameObject {
    sprite: ContaineredSprite;

    constructor(
        id: number,
        type: string,
        pos: PIXI.Point,
        rotation: number,
        collisionRadius: number,
        debugRoot: PIXI.Container,
        visualScale: number = collisionRadius * 2.5
    ) {
        super(id, pos, rotation, collisionRadius, debugRoot, visualScale);
        const config = spriteConfigs.get(type);
        this.sprite = SpriteFactory.build(type, config?.world_display);

        this.container.zIndex = 10;
        this.sprite.rotation = rotation - radians(-90);
        this.sprite.anchor.set(0.5);
        this.container.addChild(this.sprite);

        this.rotation = rotation;

        this.animations.set(ANIMATION.HURT, hit(this));
    }
}
