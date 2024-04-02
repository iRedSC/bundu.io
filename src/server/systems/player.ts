import Logger from "js-logger";
import { moveToward } from "../../lib/transforms.js";
import { Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { BasicPoint } from "../game_engine/types.js";
import { quadtree } from "./position.js";

export class PlayerSystem extends System {
    constructor() {
        super([PlayerData, Physics]);
    }

    update(time: number, delta: number, player: GameObject) {
        const physics = Physics.get(player).data;
        const data = PlayerData.get(player).data;
        if (data.moveDir[0] === 0 && data.moveDir[1] === 0) {
            return;
        }
        const newX = physics.position.x - data.moveDir[0];
        const newY = physics.position.y - data.moveDir[1];
        const target = moveToward(physics.position, { x: newX, y: newY }, 10);
        physics.position.x = target.x;
        physics.position.y = target.y;

        const bounds: [BasicPoint, BasicPoint] = [
            { x: physics.position.x - 500, y: physics.position.y - 500 },
            { x: physics.position.x + 500, y: physics.position.y + 500 },
        ];
        const nearby = quadtree.query(bounds);
        data.visibleObjects.update(nearby);
        this.trigger("positionUpdate", player.id);
        this.trigger("sendUpdatedObjects", player.id);
    }

    move(playerId: number, x: number, y: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = PlayerData.get(player).data;
        data.moveDir = [x, y];
    }

    requestObjects(playerId: number, objects: number[]) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }

        this.trigger("sendNewObjects", player.id, objects);
    }
}
