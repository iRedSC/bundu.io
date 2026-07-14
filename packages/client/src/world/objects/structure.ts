import { Graphics, type Container, type Point as PixiPoint } from "pixi.js";
import { radians } from "@bundu/shared";
import { TILE_SIZE } from "@bundu/shared/tiles";
import type {
    EntityStateSnapshot,
    EntityStateValue,
} from "@bundu/shared/object_types";
import GameObject from "../game_object";
import { spriteConfigs } from "@client/configs/sprite_configs";
import {
    SpriteFactory,
    type ContaineredSprite,
} from "@client/assets/sprite_factory";
import { assemble, assembleTileEntity } from "../../visual/assemble";
import { bindAnimations } from "../../visual/bind";
import {
    EntityStateStore,
    VisualStateController,
} from "../../visual/state";
import { structureDef, tileEntityDefs } from "../../visual/defs";
import type { ObjectDef } from "../../visual/types";
import type { AnimationManager } from "../../animation/runtime";

const HEALTH_BAR_WIDTH = 48;
const HEALTH_BAR_HEIGHT = 5;
const HEALTH_BAR_Y = -52;
const HEALTH_BAR_FADE_MS = 150;
const HEALTH_BAR_DISPLAY_MS = 2_500;

/** Placed tile entity. Art is authored at TILE_SIZE px per footprint tile. */
export class Structure extends GameObject {
    sprite!: ContaineredSprite;
    readonly type: string;
    private readonly animationManager: AnimationManager;
    private readonly states: EntityStateStore;
    private stateController?: VisualStateController;
    private usesSpriteConfig = false;
    private readonly variant?: string;
    private readonly healthBar = new Graphics();
    private healthBarAlpha = 0;
    private healthBarFadeFrom = 0;
    private healthBarFadeTo = 0;
    private healthBarFadeStartedAt = 0;
    private healthBarShownUntil = 0;
    private hovered = false;
    private hasHealth = false;

    constructor(
        id: number,
        type: string,
        pos: PixiPoint,
        rotationDegrees: number,
        collisionRadius: number,
        animationManager: AnimationManager,
        visualScale: number = TILE_SIZE,
        variant?: string,
        health?: number,
        maxHealth?: number,
        states: EntityStateSnapshot = {}
    ) {
        super(id, pos, radians(rotationDegrees), collisionRadius, visualScale);

        this.type = type;
        this.variant = variant;
        this.animationManager = animationManager;
        this.states = new EntityStateStore(states);
        this.applyVisualDefinition(variant);
        this.container.zIndex = 10;
        this.healthBar.zIndex = 100;
        this.healthBar.position.copyFrom(pos);
        this.setHealth(health ?? 0, maxHealth ?? 0);
    }

    override get containers(): Container[] {
        return [this.container, this.healthBar];
    }

    override update(_now?: number): boolean {
        const done = super.update();
        this.healthBar.position.set(this.position.x, this.position.y);
        return done;
    }

    setHealth(health: number, maxHealth: number, time?: number) {
        const ratio =
            maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
        const x = -HEALTH_BAR_WIDTH / 2;

        this.healthBar.clear();
        this.healthBar
            .rect(x, HEALTH_BAR_Y, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT)
            .fill(0x1a1a1a);
        if (ratio > 0) {
            this.healthBar
                .rect(x, HEALTH_BAR_Y, HEALTH_BAR_WIDTH * ratio, HEALTH_BAR_HEIGHT)
                .fill(0xd94b4b);
        }
        this.hasHealth = maxHealth > 0;
        if (time === undefined || !this.hasHealth) {
            this.healthBar.visible = false;
            return;
        }

        this.healthBarShownUntil = Math.max(
            this.healthBarShownUntil,
            time + HEALTH_BAR_DISPLAY_MS
        );
        this.showHealthBar(time);
    }

    updateHealthBar(time: number, cursor?: { x: number; y: number }) {
        if (!this.hasHealth) {
            this.healthBar.visible = false;
            return;
        }

        const hovered =
            cursor !== undefined &&
            Math.hypot(
                cursor.x - this.position.x,
                cursor.y - this.position.y
            ) <= Math.max(this.collisionRadius, TILE_SIZE / 2);
        if (hovered && !this.hovered) this.showHealthBar(time);
        if (!hovered && this.hovered && time >= this.healthBarShownUntil) {
            this.hideHealthBar(time);
        }
        this.hovered = hovered;

        if (!hovered && time >= this.healthBarShownUntil) {
            this.hideHealthBar(time);
        }
        this.updateHealthBarFade(time);
        this.healthBar.alpha = this.healthBarAlpha;
        this.healthBar.visible = this.healthBarAlpha > 0;
    }

    private showHealthBar(time: number) {
        this.updateHealthBarFade(time);
        if (this.healthBarFadeTo === 1) return;
        this.healthBarFadeFrom = this.healthBarAlpha;
        this.healthBarFadeTo = 1;
        this.healthBarFadeStartedAt = time;
    }

    private hideHealthBar(time: number) {
        this.updateHealthBarFade(time);
        if (this.healthBarFadeTo === 0) return;
        this.healthBarFadeFrom = this.healthBarAlpha;
        this.healthBarFadeTo = 0;
        this.healthBarFadeStartedAt = time;
    }

    private updateHealthBarFade(time: number) {
        const progress = Math.min(
            1,
            (time - this.healthBarFadeStartedAt) / HEALTH_BAR_FADE_MS
        );
        this.healthBarAlpha =
            this.healthBarFadeFrom +
            (this.healthBarFadeTo - this.healthBarFadeFrom) * progress;
    }

    private applyVisualDefinition(variant?: string) {
        const tileEntity = tileEntityDefs.get(this.type);
        const def: ObjectDef = tileEntity ?? {
            ...structureDef,
            id: this.type,
        };
        const { parts } = tileEntity
            ? assembleTileEntity(tileEntity, this.container, variant)
            : assemble(def, this.container, variant);
        const first = parts.values().next().value;
        if (!first) {
            throw new Error(`Structure definition "${def.id}" has no parts`);
        }

        this.sprite = first.visual;
        this.usesSpriteConfig = tileEntity === undefined;
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
            this.trigger(animId, this.animationManager);
        }
        this.stateController = new VisualStateController(
            def,
            parts,
            animations,
            this.states,
            this.animationManager,
            this
        );
    }

    refreshSpriteConfig() {
        if (!this.usesSpriteConfig) return;
        const config = spriteConfigs.get(this.type);
        SpriteFactory.update(this.sprite, config?.world_display, this.type);
        this.sprite.renderable = true;
    }

    setState(name: string, value: EntityStateValue) {
        this.states.set(name, value);
    }

    tickVisual(time: number) {
        this.stateController?.tick(time);
    }

    reloadVisualDefinition() {
        this.stateController?.dispose();
        this.stateController = undefined;
        this.animationManager.remove(this);
        for (const child of this.container.removeChildren()) {
            child.destroy({ children: true });
        }
        this.animations.clear();
        this.applyVisualDefinition(this.variant);
    }
}
