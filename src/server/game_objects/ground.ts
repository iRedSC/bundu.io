import { coordsToRect } from "../../lib/transforms.js";
import SAT from "sat";

export class Ground {
    pos1: SAT.Vector;
    pos2: SAT.Vector;
    collider: SAT.Box;
    type: number;

    constructor(pos1: SAT.Vector, pos2: SAT.Vector, type: number) {
        this.pos1 = pos1;
        this.pos2 = pos2;
        this.type = type;

        const rect = coordsToRect(pos1.x, pos1.y, pos2.x, pos2.y);
        const pos = new SAT.Vector(rect.x, rect.y);

        this.collider = new SAT.Box(pos, rect.width, rect.height);
    }

    pack() {
        return [this.pos1.x, this.pos1.y, this.pos2.x, this.pos2.y, this.type];
    }
}
