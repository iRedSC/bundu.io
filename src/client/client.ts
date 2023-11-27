import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import { GameObject } from "./game_objects/object_creator";

export class BunduClient {
    world: Map<number, GameObject>;

    viewport: Viewport;
    canvas: PIXI.Application;

    currentServerTime: number;

    constructor(canvas: PIXI.Application, viewport: Viewport) {
        this.world = new Map();
        this.canvas = canvas;
        this.viewport = viewport;
        this.currentServerTime = -1;
    }
}
