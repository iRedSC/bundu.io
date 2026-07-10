import type { BasicPoint } from "@bundu/shared";
import { FederatedPointerEvent, Point } from "pixi.js";
import type { Viewport } from "pixi-viewport";

export type CameraOptions = {
    /** How far the view leans toward the pointer (0 = none). */
    peek?: number;
    minZoom?: number;
    maxZoom?: number;
};

/**
 * Thin follow camera on top of pixi-viewport: track a target, optional
 * mouse look-ahead, and clamped wheel zoom.
 */
export class Camera {
    private viewport: Viewport;
    private pointer = new Point(
        typeof window !== "undefined" ? window.innerWidth / 2 : 0,
        typeof window !== "undefined" ? window.innerHeight / 2 : 0
    );

    target: BasicPoint | null = null;
    peek: number;

    constructor(viewport: Viewport, options: CameraOptions = {}) {
        this.viewport = viewport;
        this.peek = options.peek ?? 0.2;

        viewport.clampZoom({
            minScale: options.minZoom ?? 0.75,
            maxScale: options.maxZoom ?? 2.5,
        });
        viewport.wheel({ center: viewport.center });

        viewport.eventMode = "static";
        viewport.on("globalpointermove", this.onPointerMove, this);
    }

    follow(target: BasicPoint | null) {
        this.target = target;
    }

    update() {
        if (!this.target) return;

        const zoom = this.viewport.scale.x || 1;
        const x =
            this.target.x +
            (this.pointer.x - window.innerWidth / 2) * (this.peek / zoom);
        const y =
            this.target.y +
            (this.pointer.y - window.innerHeight / 2) * (this.peek / zoom);

        this.viewport.moveCenter(x, y);
    }

    private onPointerMove(ev: FederatedPointerEvent) {
        this.pointer.set(ev.clientX, ev.clientY);
    }
}
