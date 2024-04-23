import { clamp, moveToward } from "../../lib/transforms.js";
import { PACKET } from "../../shared/enums.js";
import { GroundData, Physics } from "../components/base.js";
import { Inventory, PlayerData } from "../components/player.js";
import { packCraftingList } from "../configs/loaders/crafting.js";
import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import { GlobalPacketFactory } from "../globals.js";
import { send } from "../network/send.js";
import { updateHandler } from "./packet.js";
import { PlayerController } from "./player_controller.js";

/**
 * This is the system that controls players.
 * ! Method calls come directly from client's packets, so it's a potential attack point.
 */
export class PlayerSystem extends System implements PlayerController {
    constructor() {
        super([PlayerData, Physics]);

        this.listen("kill", this.kill, [PlayerData]);
    }

    /**
     * Updates each player.
     *
     * Moves them based on their moveDir value.
     * Sends attack event if attacking is true.
     */
    update(time: number, delta: number, player: GameObject): void {
        const physics = Physics.get(player);
        const data = PlayerData.get(player);

        if (data.attacking && data.lastAttackTime && !data.blocking) {
            if (data.lastAttackTime < time - 500) {
                this.trigger("attack", player.id);
                data.lastAttackTime = time;
            }
        }
        if (data.moveDir[0] === 0 && data.moveDir[1] === 0) {
            return;
        }
        const newX = physics.position.x - data.moveDir[0];
        const newY = physics.position.y - data.moveDir[1];
        const target = moveToward(
            physics.position,
            { x: newX, y: newY },
            delta / 5
        );
        physics.position.x = clamp(target.x, 0, 20000);
        physics.position.y = clamp(target.y, 0, 20000);

        this.trigger("move", player.id);
    }

    enter(player: GameObject) {
        const ground = this.world.query([GroundData]);
        updateHandler.send(player, [ground, [PACKET.SERVER.LOAD_GROUND]]);
        GlobalPacketFactory.add(
            player.id,
            [PACKET.SERVER.CRAFTING_RECIPES],
            () => packCraftingList()
        );
        this.trigger("health_update", player.id);
    }

    kill: EventCallback<"kill"> = (player: GameObject) => {
        const inventory = player.get(Inventory);

        for (const [id, amount] of inventory.items.entries()) {
            this.trigger("spawn_item", player.id, { id, amount });
        }

        this.trigger("delete_object", player.id);
        player.active = false;
    };

    // Sets selected player's moveDir property.
    move(playerId: number, x: number, y: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = PlayerData.get(player);
        data.moveDir = [x, y];
    }

    // Sets selected player's rotation
    rotate(playerId: number, rotation: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = Physics.get(player);
        data.rotation = rotation;
        this.trigger("rotate", player.id);
    }

    // Triggers event to send objects to selected player
    requestObjects(playerId: number, objects: number[]) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }

        this.trigger("send_new_objects", player.id, objects);
    }

    // starts or stops a player from attacking
    attack(playerId: number, stop: boolean) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        const data = PlayerData.get(player);
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
        const data = PlayerData.get(player);
        if (!stop && data.attacking) {
            data.attacking = false;
        }
        data.blocking = !stop;
        this.trigger("block", player.id, stop);
    }

    selectItem(playerId: number, itemId: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        this.trigger("select_item", player.id, itemId);
    }

    craftItem(playerId: number, itemId: number) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        this.trigger("craft_item", player.id, itemId);
    }

    chatMessage(playerId: number, message: string) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        this.trigger("chat_message", player.id, message);
    }

    dropItem(playerId: number, itemId: number, all: boolean) {
        const player = this.world.getObject(playerId);
        if (!player) {
            return;
        }
        this.trigger("drop_item", player.id, { id: itemId, all: all });
    }
}
