import { moveToward } from "../../lib/transforms.js";
import { BasicPoint } from "../../lib/types.js";
import { PACKET_TYPE } from "../../shared/enums.js";
import { GroundData, Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { updateHandler } from "./packet.js";
import { PlayerController } from "./player_controller.js";
import { quadtree } from "./position.js";

/**
 * This is the system that controls players.
 * ! Method calls come directly from client's packets, so it's a potential attack point.
 */
export class PlayerSystem extends System implements PlayerController {
    constructor() {
        super([PlayerData, Physics]);
    }

    /**
     * Updates each player.
     *
     * Moves them based on their moveDir value.
     * Sends attack event if attacking is true.
     */
    update(time: number, delta: number, player: GameObject): void {
        const physics = Physics.get(player).data;
        const data = PlayerData.get(player).data;

        if (data.attacking && data.lastAttackTime && !data.blocking) {
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

    enter(player: GameObject) {
        const ground = this.world.query([GroundData.id]);
        updateHandler.send(player, [
            ground.values(),
            [PACKET_TYPE.LOAD_GROUND],
        ]);
    }

    // Sets selected player's moveDir property.
    move(playerId: number, x: number, y: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = PlayerData.get(player).data;
        data.moveDir = [x, y];
    }

    // Sets selected player's rotation
    rotate(playerId: number, rotation: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = Physics.get(player).data;
        data.rotation = rotation;
        this.trigger("rotated", player.id);
    }

    // Triggers event to send objects to selected player
    requestObjects(playerId: number, objects: number[]) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }

        this.trigger("sendNewObjects", player.id, objects);
    }

    // starts or stops a player from attacking
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

    // starts or stops a player from blocking
    block(playerId: number, stop: boolean) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = PlayerData.get(player).data;
        if (!stop && data.attacking) {
            data.attacking = false;
        }
        data.blocking = !stop;
        this.trigger("blocking", player.id, stop);
    }
}
