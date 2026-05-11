import { GameObject } from "@ioengine/server";
import { GroundItemData, Health, Physics } from "../components/base.js";

export class GroundItem extends GameObject {
    constructor(physics: Physics, itemData: GroundItemData) {
        super();

        this.add(new Physics(physics))
            .add(new GroundItemData(itemData))
            .add(new Health({ value: 1, max: 1 }));
    }
}
