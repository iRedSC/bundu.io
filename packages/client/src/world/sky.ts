import { Graphics } from "pixi.js";
import { WORLD_SIZE } from "../constants";

/** Day/night multiply overlay. Time cycling is unfinished — no setTime caller yet. */
export class Sky extends Graphics {
    constructor() {
        super();
        this.rect(0, 0, WORLD_SIZE, WORLD_SIZE).fill(0xffffff);
        this.zIndex = 200;
        this.blendMode = "multiply";
    }
}
