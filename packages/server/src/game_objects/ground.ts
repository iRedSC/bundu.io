import { GroundData } from "../components/base.js";
import { GameObject } from "../engine";

export class Ground extends GameObject {
    constructor(data: GroundData) {
        super();
        this.add(new GroundData(data));
    }
}
