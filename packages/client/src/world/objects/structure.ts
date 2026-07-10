import * as PIXI from "pixi.js";
import { radians } from "@bundu/shared";
import {
    FOOTPRINT_CIRCLE_RADIUS,
    TILE_SIZE,
} from "@bundu/shared/tiles";
import GameObject from "../game_object";
import { ANIMATION, hit } from "../../animation/animations";
import { spriteConfigs } from "@client/configs/sprite_configs";
import {
    SpriteFactory,
    ContaineredSprite,
} from "@client/assets/sprite_factory";

/** Placed tile entity. Art is authored at TILE_SIZE px per footprint tile. */
export class Structure extends GameObject {
    sprite: ContaineredSprite;

    constructor(
        id: number,
        type: string,
        pos: PIXI.Point,
        rotationDegrees: number,
        collisionRadius: number = FOOTPRINT_CIRCLE_RADIUS,
        visualScale: number = TILE_SIZE
    ) {
        super(id, pos, radians(rotationDegrees), collisionRadius, visualScale);
        const config = spriteConfigs.get(type);
        this.sprite = SpriteFactory.build(type, config?.world_display);

        this.container.zIndex = 10;
        this.sprite.anchor.set(0.5);
        this.container.addChild(this.sprite);

        this.animations.set(ANIMATION.HURT, hit(this));
    }
}
