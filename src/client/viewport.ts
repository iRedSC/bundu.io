import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import { WORLD_SIZE } from "./constants";

export function createViewport(app: PIXI.Application, center: PIXI.Point) {
    const viewport = new Viewport({
        worldHeight: WORLD_SIZE,
        worldWidth: WORLD_SIZE,
        ticker: app.ticker,
        events: app.renderer.events,
    });

    // viewport.pivot.set(viewport.worldWidth / 2, viewport.worldHeight / 2);
    // viewport.position.set(0, 0);

    // viewport.clampZoom({ minScale: 0.15, maxScale: 1 });
    viewport.clamp({
        direction: "all",
        left: true,
        right: true,
        top: true,
        bottom: true,
    });

    viewport.sortableChildren = true;

    viewport.wheel({ center: center });
    viewport.setZoom(0.2);

    return viewport;
}
