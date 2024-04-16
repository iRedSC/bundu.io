import { Container } from "pixi.js";

export class IDContainer extends Container {
    id: number;

    constructor(id: number) {
        super();
        this.id = id;
    }
}
