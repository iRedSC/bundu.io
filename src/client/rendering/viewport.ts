import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import { WORLD_SIZE } from "../constants";

export function createViewport(app: PIXI.Application, center: PIXI.Point) {
    const viewport = new Viewport({
        worldHeight: WORLD_SIZE,
        worldWidth: WORLD_SIZE,
        ticker: app.ticker,
        events: app.renderer.events,
    });

    // viewport.clampZoom({ minScale: 0.1, maxScale: 1 });
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
