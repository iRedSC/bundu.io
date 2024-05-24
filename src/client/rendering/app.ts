import { Application, Ticker } from "pixi.js";

declare module globalThis {
    var __PIXI_APP__: Application;
}

/**
 * create pixi.js app and return it
 * @returns pixi.js app
 */
export class PixiApp {
    static app = new Application<HTMLCanvasElement>({
        resizeTo: window,
        backgroundColor: 0x0d5b73,
        antialias: false,
        autoDensity: true,
    });
}
const ticker = Ticker.shared;
ticker.autoStart = false;
ticker.stop();

globalThis.__PIXI_APP__ = PixiApp.app;
