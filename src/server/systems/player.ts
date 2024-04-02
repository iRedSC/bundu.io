import Logger from "js-logger";
import { moveToward } from "../../lib/transforms.js";
import { Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { BasicPoint } from "../game_engine/types.js";
import { quadtree } from "./position.js";
import { Player } from "../game_objects/player.js";

export class PlayerSystem extends System {
    constructor() {
        super([PlayerData, Physics]);
    }

    update(time: number, delta: number, player: GameObject) {
        const physics = Physics.get(player).data;
        const data = PlayerData.get(player).data;

        if (data.attacking && data.lastAttackTime) {
            console.log("GAMETIME = ", data.lastAttackTime);
            if (data.lastAttackTime < time - 400) {
                this.trigger("attack", player.id);
                data.lastAttackTime = time;
            }
        }
        if (data.moveDir[0] === 0 && data.moveDir[1] === 0) {
            return;
        }
        const newX = physics.position.x - data.moveDir[0];
        const newY = physics.position.y - data.moveDir[1];
        const target = moveToward(physics.position, { x: newX, y: newY }, 10);
        physics.position.x = target.x;
        physics.position.y = target.y;

        this.trigger("moved", player.id);
    }

    move(playerId: number, x: number, y: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = PlayerData.get(player).data;
        data.moveDir = [x, y];
    }

    rotate(playerId: number, rotation: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = Physics.get(player).data;
        data.rotation = rotation;
        this.trigger("rotated", player.id);
    }

    requestObjects(playerId: number, objects: number[]) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }

        this.trigger("sendNewObjects", player.id, objects);
    }

    attack(playerId: number, stop: boolean) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = PlayerData.get(player).data;
        data.attacking = !stop;
        if (data.lastAttackTime === undefined) {
            data.lastAttackTime = this.world.gameTime;
        }
    }

    block(playerId: number, stop: boolean) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = PlayerData.get(player).data;
        data.blocking = !stop;
        this.trigger("blocking", player.id, stop);
    }
}
