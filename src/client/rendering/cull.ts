import { Simple } from "pixi-cull";
import { Viewport } from "pixi-viewport";

/**
 * adds simple culling to specified viewport
 * @param viewport the viewport to add culling to
 */
export function cullViewport(viewport: Viewport) {
    const cull = new Simple();
    cull.addList(viewport.children);
    cull.cull(viewport.getVisibleBounds());
    viewport.on("frame-end", () => {
        if (viewport.dirty) {
            cull.cull(viewport.getVisibleBounds());
            viewport.dirty = false;
        }
    });
}
