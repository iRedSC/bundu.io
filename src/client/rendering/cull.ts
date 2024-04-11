import { Simple } from "pixi-cull";
import { Viewport } from "pixi-viewport";

export function cullContainer(viewport: Viewport) {
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
