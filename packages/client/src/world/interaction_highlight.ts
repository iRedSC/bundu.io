import { Sprite } from "pixi.js";
import type { ContaineredSprite } from "../assets/sprite_factory";
import type { PartNode } from "../models/types";
import type { Structure } from "./objects/structure";

export type InteractionHighlightMode = "can" | "cannot";

const STYLE = {
    can: { outline: 0xff8a2b, glow: 0xff9a40 },
    cannot: { outline: 0x8a8a8a, glow: 0x9a9a9a },
} as const;

const OUTLINE_SCALE = 1.08;
const GLOW_SCALE = 1.2;
const GLOW_ALPHA = 0.4;
const OUTLINE_ALPHA = 0.95;

type OverlayPair = {
    follow: ContaineredSprite;
    outline: Sprite;
    glow: Sprite;
    baseScaleX: number;
    baseScaleY: number;
};

/**
 * Texture-following outline + additive glow for hovered interactables.
 * Clones each visible part sprite (not footprint Graphics).
 */
export class InteractionHighlight {
    private overlays: OverlayPair[] = [];
    private structure?: Structure;
    private mode: InteractionHighlightMode = "can";
    private active = false;

    attach(structure: Structure, mode: InteractionHighlightMode): void {
        if (this.structure === structure) {
            this.setMode(mode);
            this.setActive(true);
            return;
        }
        this.dispose();
        this.structure = structure;
        this.mode = mode;
        for (const part of structure.partNodes().values()) {
            this.bindPart(part);
        }
        this.applyStyle();
        this.setActive(true);
    }

    setMode(mode: InteractionHighlightMode): void {
        if (this.mode === mode) return;
        this.mode = mode;
        this.applyStyle();
    }

    setActive(active: boolean): void {
        this.active = active;
        this.syncVisibility();
    }

    /** Refresh visibility when part state (open/spiked) changes. */
    syncVisibility(): void {
        for (const overlay of this.overlays) {
            const show =
                this.active &&
                overlay.follow.renderable &&
                isShown(overlay.follow);
            overlay.outline.visible = show;
            overlay.glow.visible = show;
        }
    }

    dispose(): void {
        for (const overlay of this.overlays) {
            overlay.outline.destroy();
            overlay.glow.destroy();
        }
        this.overlays = [];
        this.structure = undefined;
        this.active = false;
    }

    private bindPart(part: PartNode): void {
        const follow = part.visual;
        const texture = follow.sprite.texture;
        if (!texture || texture.width <= 0 || texture.height <= 0) return;

        const parent = follow.parent;
        if (!parent) return;

        const index = parent.getChildIndex(follow);
        const glow = new Sprite(texture);
        const outline = new Sprite(texture);
        glow.anchor.copyFrom(follow.sprite.anchor);
        outline.anchor.copyFrom(follow.sprite.anchor);
        glow.eventMode = "none";
        outline.eventMode = "none";
        glow.blendMode = "add";
        glow.position.copyFrom(follow.sprite.position);
        outline.position.copyFrom(follow.sprite.position);
        glow.rotation = follow.sprite.rotation;
        outline.rotation = follow.sprite.rotation;

        const baseScaleX = follow.sprite.scale.x;
        const baseScaleY = follow.sprite.scale.y;
        parent.addChildAt(glow, index);
        parent.addChildAt(outline, index + 1);

        this.overlays.push({
            follow,
            outline,
            glow,
            baseScaleX,
            baseScaleY,
        });
    }

    private applyStyle(): void {
        const colors = STYLE[this.mode];
        for (const overlay of this.overlays) {
            overlay.outline.tint = colors.outline;
            overlay.glow.tint = colors.glow;
            overlay.outline.alpha = OUTLINE_ALPHA;
            overlay.glow.alpha = GLOW_ALPHA;
            overlay.outline.scale.set(
                overlay.baseScaleX * OUTLINE_SCALE,
                overlay.baseScaleY * OUTLINE_SCALE
            );
            overlay.glow.scale.set(
                overlay.baseScaleX * GLOW_SCALE,
                overlay.baseScaleY * GLOW_SCALE
            );
        }
    }
}

function isShown(node: { visible: boolean; parent?: unknown }): boolean {
    let current: { visible: boolean; parent?: unknown } | null | undefined =
        node;
    while (current) {
        if (!current.visible) return false;
        current = current.parent as
            | { visible: boolean; parent?: unknown }
            | null
            | undefined;
    }
    return true;
}
