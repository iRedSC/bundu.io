import type * as PIXI from "pixi.js";
import { radians } from "@bundu/shared";
import { TILE_SIZE } from "@bundu/shared/tiles";
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
import type { AnimationManager } from "../../animation/runtime";

/** Placed tile entity. Art is authored at TILE_SIZE px per footprint tile. */
export class Structure extends GameObject {
    sprite: ContaineredSprite;
    readonly type: string;
    private readonly animationManager: AnimationManager;
    private readonly usesSpriteConfig: boolean;
    private readonly variant: string;

    constructor(
        id: number,
        type: string,
        pos: PIXI.Point,
        rotationDegrees: number,
        collisionRadius: number,
        animationManager: AnimationManager,
        visualScale: number = TILE_SIZE,
        variant: string = "base"
    ) {
        super(id, pos, radians(rotationDegrees), collisionRadius, visualScale);

        this.type = type;
        this.variant = variant;
        this.animationManager = animationManager;
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

        const { animations, autoplay } = bindAnimations(
            def,
            parts,
            undefined,
            this
        );
        for (const [animId, animation] of animations) {
            this.animations.set(animId, animation);
        }
        for (const animId of autoplay) {
            this.trigger(animId, animationManager);
        }

        this.container.zIndex = 10;
    }

    refreshSpriteConfig() {
        if (!this.usesSpriteConfig) return;
        const config = spriteConfigs.get(this.type);
        SpriteFactory.update(this.sprite, config?.world_display, this.type);
        this.sprite.renderable = true;
    }

    reloadVisualDefinition() {
        this.animationManager.remove(this);
        for (const child of this.container.removeChildren()) {
            child.destroy({ children: true });
        }
        this.animations.clear();

        const isTree = this.type === "forest_tree";
        const def: ObjectDef = isTree
            ? treeDef
            : { ...structureDef, id: this.type };
        const { parts } = isTree
            ? assembleTileEntity(treeDef, this.container, this.variant)
            : assemble(def, this.container, this.variant);
        const first = parts.values().next().value;
        if (!first) {
            throw new Error(`Structure definition "${def.id}" has no parts`);
        }
        this.sprite = first.visual;
        this.refreshSpriteConfig();

        const { animations, autoplay } = bindAnimations(
            def,
            parts,
            undefined,
            this
        );
        for (const [id, animation] of animations) {
            this.animations.set(id, animation);
        }
        for (const id of autoplay) {
            this.trigger(id, this.animationManager);
        }
    }
}
