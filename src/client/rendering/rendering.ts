import * as PIXI from "pixi.js";
import { createViewport } from "./viewport";
import { Simple } from "pixi-cull";
import { UI } from "../ui/test";

declare module globalThis {
    var __PIXI_APP__: PIXI.Application;
}

export function createRenderer() {
    const app = new PIXI.Application<HTMLCanvasElement>({
        resizeTo: window,
        backgroundColor: 0x0d5b73,
    });

    globalThis.__PIXI_APP__ = app;

    const viewport = createViewport(app, new PIXI.Point(0, 0));
    app.stage.addChild(viewport);
    app.stage.addChild(UI);
    const cull = new Simple();
    cull.addList(viewport.children);
    cull.cull(viewport.getVisibleBounds());
    viewport.on("frame-end", () => {
        if (viewport.dirty) {
            cull.cull(viewport.getVisibleBounds());

            viewport.dirty = false;
        }
    });

    viewport.sortChildren();
    document.body.appendChild(app.view);

    window.onresize = (_) => {
        viewport.resize(window.innerWidth, window.innerHeight);
    };

    return { app: app, viewport: viewport };
}
