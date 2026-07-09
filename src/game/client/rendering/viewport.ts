import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import { WORLD_SIZE } from "../constants";

/** Creates a pixi-viewport world container (camera plugins are owned by Camera). */
export function createViewport(app: PIXI.Application) {
    const viewport = new Viewport({
        worldHeight: WORLD_SIZE,
        worldWidth: WORLD_SIZE,
        ticker: app.ticker,
        events: app.renderer.events,
    });

    viewport.sortableChildren = true;

    window.onresize = (_) => {
        viewport.resize(window.innerWidth, window.innerHeight);
    };

    return viewport;
}
