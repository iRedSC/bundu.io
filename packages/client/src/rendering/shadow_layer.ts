import { BlurFilter, Container, Matrix, Rectangle } from "pixi.js";
import type { ContaineredSprite } from "../assets/sprite_factory";
import {
    lightPushAt,
    shadowStyle,
    type ShadowLight,
} from "../visual/shadow";

type ShadowEntry = {
    shadow: ContaineredSprite;
    follow: Container;
    state: Container;
};

/**
 * All drop shadows live here so soften is one BlurFilter pass, not per sprite.
 * Silhouettes are unfiltered children; the layer blurs them together.
 */
export class ShadowLayer {
    readonly container = new Container();
    private readonly entries = new Set<ShadowEntry>();
    private readonly local = new Matrix();
    private readonly invParent = new Matrix();
    private readonly view = new Rectangle();
    private blur?: BlurFilter;
    private appliedSoften = -1;
    private lights: readonly ShadowLight[] = [];

    constructor() {
        // Above ground (-10), under players/structures so only the offset rim shows.
        this.container.zIndex = 0;
        this.container.eventMode = "none";
        this.container.sortableChildren = false;
        this.container.onRender = () => this.sync();
    }

    /** World-space lights (fires, etc.) refreshed each tick. */
    setLights(lights: readonly ShadowLight[]): void {
        this.lights = lights;
    }

    /** Limit blur to the visible world so the filter RT stays finite. */
    setView(x: number, y: number, width: number, height: number): void {
        this.view.x = x;
        this.view.y = y;
        this.view.width = width;
        this.view.height = height;
        this.container.filterArea = this.view;
    }

    attach(
        shadow: ContaineredSprite,
        follow: Container,
        state: Container
    ): void {
        this.entries.add({ shadow, follow, state });
        this.container.addChild(shadow);
    }

    detach(shadow: ContaineredSprite): void {
        for (const entry of this.entries) {
            if (entry.shadow !== shadow) continue;
            this.entries.delete(entry);
            if (!shadow.destroyed) {
                shadow.removeFromParent();
                shadow.destroy({ children: true });
            }
            return;
        }
    }

    clear(): void {
        for (const entry of [...this.entries]) {
            this.entries.delete(entry);
            if (!entry.shadow.destroyed) {
                entry.shadow.destroy({ children: true });
            }
        }
        this.container.removeChildren();
        this.lights = [];
    }

    destroy(): void {
        this.clear();
        this.blur?.destroy();
        this.blur = undefined;
        this.container.destroy({ children: true });
    }

    private syncBlur(): void {
        const soften = shadowStyle.soften;
        if (soften <= 0) {
            if (this.container.filters) this.container.filters = null;
            this.appliedSoften = 0;
            return;
        }
        if (!this.blur) {
            this.blur = new BlurFilter({ strength: soften, quality: 2 });
        } else if (this.appliedSoften !== soften) {
            this.blur.strength = soften;
        }
        this.appliedSoften = soften;
        if (this.container.filters?.[0] !== this.blur) {
            this.container.filters = [this.blur];
        }
    }

    private sync(): void {
        this.syncBlur();
        this.invParent.copyFrom(this.container.worldTransform).invert();
        const lights = this.lights;
        for (const entry of this.entries) {
            const { shadow, follow, state } = entry;
            if (follow.destroyed || shadow.destroyed || state.destroyed) {
                this.entries.delete(entry);
                if (!shadow.destroyed) shadow.destroy({ children: true });
                continue;
            }
            // Match the part visual's world pose, then nudge in screen space.
            this.local.copyFrom(this.invParent).append(follow.worldTransform);
            shadow.setFromMatrix(this.local);
            const scale = Math.hypot(this.local.a, this.local.b);
            const push = lightPushAt(this.local.tx, this.local.ty, lights);
            shadow.x += shadowStyle.offsetX * scale + push.x;
            shadow.y += shadowStyle.offsetY * scale + push.y;
            shadow.alpha = shadowStyle.alpha * state.alpha * follow.alpha;
            shadow.visible =
                state.visible && follow.visible && follow.renderable;
        }
    }
}

let active: ShadowLayer | undefined;

export function setActiveShadowLayer(layer: ShadowLayer | undefined): void {
    active = layer;
}

export function registerPartShadow(
    shadow: ContaineredSprite,
    follow: Container,
    state: Container
): void {
    if (!active) {
        // Assemble ran before the world layer existed — drop the orphan.
        shadow.destroy({ children: true });
        return;
    }
    active.attach(shadow, follow, state);
}

export function unregisterPartShadow(shadow: ContaineredSprite): void {
    active?.detach(shadow);
}
