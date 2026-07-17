import type { BasicPoint } from "@bundu/shared";
import type { Viewport } from "pixi-viewport";

export type CameraOptions = {
    minZoom?: number;
    maxZoom?: number;
};

const PLAY_MIN_ZOOM = 0.75;
const PLAY_MAX_ZOOM = 2.5;
const FREECAM_MIN_ZOOM = 0.05;
const FREECAM_MAX_ZOOM = 2.5;

/**
 * Thin follow camera on top of pixi-viewport: track a target and clamped wheel zoom.
 */
export class Camera {
    private viewport: Viewport;
    private freecam = false;

    target: BasicPoint | null = null;

    constructor(viewport: Viewport, options: CameraOptions = {}) {
        this.viewport = viewport;

        viewport.clampZoom({
            minScale: options.minZoom ?? PLAY_MIN_ZOOM,
            maxScale: options.maxZoom ?? PLAY_MAX_ZOOM,
        });
        // Play mode zooms toward screen center while the camera follows the player.
        viewport.wheel({ percent: 0.1, center: viewport.center });
    }

    follow(target: BasicPoint | null) {
        this.target = target;
    }

    setFreecam(enabled: boolean): void {
        if (this.freecam === enabled) return;
        this.freecam = enabled;
        if (enabled) {
            this.target = null;
            this.viewport.clampZoom({
                minScale: FREECAM_MIN_ZOOM,
                maxScale: FREECAM_MAX_ZOOM,
            });
            // Re-bind wheel without a fixed center so zoom stays under the cursor.
            this.viewport.plugins.remove("wheel");
            this.viewport.wheel({ percent: 0.1 });
            this.viewport.drag({
                pressDrag: true,
                mouseButtons: "middle",
            });
        } else {
            this.viewport.plugins.remove("drag");
            this.viewport.clampZoom({
                minScale: PLAY_MIN_ZOOM,
                maxScale: PLAY_MAX_ZOOM,
            });
            this.viewport.plugins.remove("wheel");
            this.viewport.wheel({
                percent: 0.1,
                center: this.viewport.center,
            });
            if (this.viewport.scale.x < PLAY_MIN_ZOOM) {
                // Keep current view center while restoring play zoom.
                this.viewport.setZoom(PLAY_MIN_ZOOM, true);
            }
        }
    }

    isFreecam(): boolean {
        return this.freecam;
    }

    /** World-space AABB of the current screen. */
    worldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
        const topLeft = this.viewport.toWorld(0, 0);
        const bottomRight = this.viewport.toWorld(
            this.viewport.screenWidth,
            this.viewport.screenHeight
        );
        return {
            minX: Math.min(topLeft.x, bottomRight.x),
            minY: Math.min(topLeft.y, bottomRight.y),
            maxX: Math.max(topLeft.x, bottomRight.x),
            maxY: Math.max(topLeft.y, bottomRight.y),
        };
    }

    update() {
        if (!this.target) return;
        this.viewport.moveCenter(this.target.x, this.target.y);
    }
}
