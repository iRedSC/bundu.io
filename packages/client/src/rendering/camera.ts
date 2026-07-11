import type { BasicPoint } from "@bundu/shared";
import type { Viewport } from "pixi-viewport";

export type CameraOptions = {
    minZoom?: number;
    maxZoom?: number;
};

/**
 * Thin follow camera on top of pixi-viewport: track a target and clamped wheel zoom.
 */
export class Camera {
    private viewport: Viewport;

    target: BasicPoint | null = null;

    constructor(viewport: Viewport, options: CameraOptions = {}) {
        this.viewport = viewport;

        viewport.clampZoom({
            minScale: options.minZoom ?? 0.75,
            maxScale: options.maxZoom ?? 2.5,
        });
        viewport.wheel({ center: viewport.center });
    }

    follow(target: BasicPoint | null) {
        this.target = target;
    }

    update() {
        if (!this.target) return;
        this.viewport.moveCenter(this.target.x, this.target.y);
    }
}
