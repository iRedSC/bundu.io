import * as PIXI from "pixi.js";
import { radians } from "@bundu/shared";
import {
    FOOTPRINT_CIRCLE_RADIUS,
    TILE_SIZE,
} from "@bundu/shared/tiles";
import GameObject from "../game_object";
import { spriteConfigs } from "@client/configs/sprite_configs";
import {
    SpriteFactory,
    type ContaineredSprite,
} from "@client/assets/sprite_factory";
import { assemble } from "../../visual/assemble";
import { bindAnimations } from "../../visual/bind";
import { structureDef } from "../../visual/defs/structure";

/** Placed tile entity. Art is authored at TILE_SIZE px per footprint tile. */
export class Structure extends GameObject {
    sprite: ContaineredSprite;
    readonly type: string;

    constructor(
        id: number,
        type: string,
        pos: PIXI.Point,
        rotationDegrees: number,
        collisionRadius: number = FOOTPRINT_CIRCLE_RADIUS,
        visualScale: number = TILE_SIZE
    ) {
        super(id, pos, radians(rotationDegrees), collisionRadius, visualScale);

        this.type = type;
        const def = structureDef(type);
        const { parts } = assemble(def, this.container);
        const main = parts.get("main");
        if (!main) throw new Error(`structureDef("${type}") missing main part`);

        this.sprite = main.visual;
        const config = spriteConfigs.get(type);
        SpriteFactory.update(this.sprite, config?.world_display, type);

        const { animations } = bindAnimations(def, parts, undefined, this);
        for (const [animId, animation] of animations) {
            this.animations.set(animId, animation);
        }

        this.container.zIndex = 10;
    }
}
