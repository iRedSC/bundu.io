import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import { WORLD_SIZE } from "../constants";

/** Creates a pixi-viewport world container (camera plugins are owned by Camera). */
export function createViewport(app: PIXI.Application) {
    const viewport = new Viewport({
        worldHeight: WORLD_SIZE,
        worldWidth: WORLD_SIZE,
        events: app.renderer.events,
        noTicker: true,
    });

    viewport.sortableChildren = true;

    const resize = () => {
        viewport.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", resize);
    resize();

    return viewport;
}
