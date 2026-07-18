import { DecorationData } from "../components/base.js";
import { GameObject } from "../engine";

export class Decoration extends GameObject {
    constructor(data: DecorationData) {
        super();
        this.add(new DecorationData(data));
    }
}
