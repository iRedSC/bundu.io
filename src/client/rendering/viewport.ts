import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import { WORLD_SIZE } from "../constants";

/**
 * creates a pixi viewport and returns it
 * @param app pixi.js application to attach viewport to
 * @param center center point of the viewport
 * @returns the viewport
 */
export function createViewport(app: PIXI.Application, center: PIXI.Point) {
    const viewport = new Viewport({
        worldHeight: WORLD_SIZE,
        worldWidth: WORLD_SIZE,
        ticker: app.ticker,
        events: app.renderer.events,
    });

    // viewport.clampZoom({ minScale: 0.1, maxScale: 1 });
    // viewport.clamp({
    //     direction: "all",
    //     left: true,
    //     right: true,
    //     top: true,
    //     bottom: true,
    // });

    viewport.sortableChildren = true;

    viewport.wheel({ center: center });
    viewport.setZoom(0.2);

    window.onresize = (_) => {
        viewport.resize(window.innerWidth, window.innerHeight);
    };

    return viewport;
}
