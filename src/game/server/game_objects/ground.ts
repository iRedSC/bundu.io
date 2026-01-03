import { GroundData } from "../components/base.js";
import { GameObject } from "@ioengine/server";

export class Ground extends GameObject {
    constructor(data: GroundData) {
        super();
        this.add(new GroundData(data));
    }
}
