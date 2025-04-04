import { GroundData } from "../components/base.js";
import { GameObject } from "../game_engine/game_object.js";
import { PACKET } from "../../shared/enums.js";

export class Ground extends GameObject {
    constructor(data: GroundData) {
        super();
        this.add(new GroundData(data));
        this.pack[PACKET.SERVER.LOAD_GROUND] = () => {
            const data = GroundData.get(this);
            return [
                data.collider.pos.x,
                data.collider.pos.y,
                data.collider.w,
                data.collider.h,
                data.type,
            ];
        };
    }
}
