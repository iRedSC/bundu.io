import { Viewport } from "pixi-viewport";
import type * as PIXI from "pixi.js";
import { WORLD_SIZE } from "../constants";

const resizeHandlers = new WeakMap<Viewport, () => void>();

/** Creates a pixi-viewport world container (camera plugins are owned by Camera). */
export function createViewport(app: PIXI.Application) {
    const viewport = new Viewport({
        worldHeight: WORLD_SIZE,
        worldWidth: WORLD_SIZE,
        ticker: app.ticker,
        events: app.renderer.events,
    });

    viewport.sortableChildren = true;

    const resize = () => {
        viewport.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", resize);
    resizeHandlers.set(viewport, resize);
    resize();

    return viewport;
}

export function destroyViewport(viewport: Viewport): void {
    const resize = resizeHandlers.get(viewport);
    if (resize) window.removeEventListener("resize", resize);
    resizeHandlers.delete(viewport);
    viewport.removeFromParent();
    viewport.destroy({ children: true });
}
