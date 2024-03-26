import * as PIXI from "pixi.js";
import { Line } from "./game_objects/line";
import { Circle } from "./game_objects/circle";

export const debugContainer = new PIXI.Container();

export class DebugWorldObject {
    stateLine?: Line;
    hitbox?: Circle;

    constructor() {}

    updateStateLine(line: Line) {
        if (this.stateLine) {
            debugContainer.removeChild(this.stateLine);
        }
        debugContainer.addChild(line);
        this.stateLine = line;
    }
    updateHitbox(hitbox: Circle) {
        if (this.hitbox) {
            debugContainer.removeChild(this.hitbox);
        }
        this.hitbox = hitbox;
        debugContainer.addChild(this.hitbox);
    }
}
