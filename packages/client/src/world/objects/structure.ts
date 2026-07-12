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
import { assemble, assembleTileEntity } from "../../visual/assemble";
import { bindAnimations } from "../../visual/bind";
import { structureDef, treeDef } from "../../visual/defs";
import type { ObjectDef } from "../../visual/types";

/** Placed tile entity. Art is authored at TILE_SIZE px per footprint tile. */
export class Structure extends GameObject {
    sprite: ContaineredSprite;
    readonly type: string;
    private readonly usesSpriteConfig: boolean;

    constructor(
        id: number,
        type: string,
        pos: PIXI.Point,
        rotationDegrees: number,
        collisionRadius: number = FOOTPRINT_CIRCLE_RADIUS,
        visualScale: number = TILE_SIZE,
        variant: string = "base"
    ) {
        super(id, pos, radians(rotationDegrees), collisionRadius, visualScale);

        this.type = type;
        const isTree = type === "forest_tree";
        const def: ObjectDef = isTree ? treeDef : { ...structureDef, id: type };
        const { parts } = isTree
            ? assembleTileEntity(treeDef, this.container, variant)
            : assemble(def, this.container, variant);
        const first = parts.values().next().value;
        if (!first) {
            throw new Error(`Structure definition "${def.id}" has no parts`);
        }

        this.sprite = first.visual;
        this.usesSpriteConfig = !isTree;
        this.refreshSpriteConfig();

        const { animations } = bindAnimations(def, parts, undefined, this);
        for (const [animId, animation] of animations) {
            this.animations.set(animId, animation);
        }

        this.container.zIndex = 10;
    }

    refreshSpriteConfig() {
        if (!this.usesSpriteConfig) return;
        const config = spriteConfigs.get(this.type);
        SpriteFactory.update(this.sprite, config?.world_display, this.type);
    }
}
