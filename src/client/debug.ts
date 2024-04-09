import * as PIXI from "pixi.js";
import { Line } from "./world/debug/line";
import { Circle } from "./world/debug/circle";

// ! This thing kinda sucks. Causes a butt ton of lag, needs to be fixed.
// Used for creating debug objects on the map, such as hitboxes or id text.

export const debugContainer = new PIXI.Container();

export class DebugWorldObject {
    stateLine?: Line;
    hitbox?: Circle;
    id?: PIXI.Text;

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

    updateId(id: PIXI.Text) {
        if (this.id) {
            debugContainer.removeChild(this.id);
        }
        this.id = id;
        debugContainer.addChild(this.id);
    }
}
