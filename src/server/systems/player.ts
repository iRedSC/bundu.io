import { moveToward } from "../../lib/transforms.js";
import { PACKET } from "../../shared/enums.js";
import { GroundData, Modifiers, Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { Inventory } from "../components/inventory.js";
import { packCraftingList } from "../configs/loaders/crafting.js";
import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import { GlobalPacketFactory, GlobalSocketManager } from "../globals.js";
import { updateHandler } from "./packet.js";
import { PlayerController } from "./player_controller.js";
import { ItemConfigs } from "../configs/loaders/items.js";
import { idMap } from "../configs/loaders/id_map.js";

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
        const data = player.get(PlayerData);
        const modifiers = player.get(Modifiers);

        if (data.attacking && data.lastAttackTime && !data.blocking) {
            if (data.lastAttackTime < time - 500) {
                const damage = modifiers?.calc(1, "attack_damage") ?? 1;

                this.trigger("attack", player.id, {
                    weapon: data.mainHand,
                    damage,
                });
                modifiers?.set(
                    "movement_speed",
                    "attacking",
                    "multiply",
                    0.7,
                    500
                );
                data.lastAttackTime = time;
            }
        }
        if (data.moveDir[0] === 0 && data.moveDir[1] === 0) {
            return;
        }
        const baseSpeed = delta / 5;
        const target = moveToward(
            { x: 0, y: 0 },
            { x: data.moveDir[0], y: data.moveDir[1] },
            modifiers?.calc(baseSpeed, "movement_speed") ?? baseSpeed
        );
        this.trigger("move", player.id, target);
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
        const socket = GlobalSocketManager.sockets.getv(player.id);
        socket?.end();
        GlobalSocketManager.sockets.deletev(player.id);
        player.active = false;
    };

    // Sets selected player's moveDir property.
    move(playerId: number, x: number, y: number) {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        data.moveDir = [x, y];
    }

    // Sets selected player's rotation
    rotate(playerId: number, rotation: number) {
        const player = this.world.getObject(playerId);
        if (!player) return;
        this.trigger("rotate", player.id, { rotation });
    }

    // Triggers event to send objects to selected player
    requestObjects(playerId: number, objects: number[]) {
        const player = this.world.getObject(playerId);
        if (!player) return;

        this.trigger("send_new_objects", player.id, objects);
    }

    // starts or stops a player from attacking
    attack(playerId: number, stop: boolean) {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        data.attacking = !stop;
        if (data.lastAttackTime === undefined) {
            data.lastAttackTime = this.world.gameTime;
        }
    }

    // starts or stops a player from blocking
    block(playerId: number, stop: boolean) {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        const modifiers = player.get(Modifiers);
        const config = ItemConfigs.get(data.mainHand);
        if (!config?.block) {
            return;
        }
        if (!stop && data.attacking) {
            data.attacking = false;
        }
        data.blocking = !stop;
        if (data.blocking) {
            modifiers?.set("movement_speed", "blocking", "multiply", 0.6);
            modifiers?.set("defense", "blocking", "add", config.block);
        } else {
            modifiers?.clear("blocking");
        }
        this.trigger("block", player.id, stop);
    }

    selectItem(playerId: number, itemId: number) {
        const player = this.world.getObject(playerId);
        if (!player) return;
        this.trigger("select_item", player.id, itemId);
    }

    craftItem(playerId: number, itemId: number) {
        const player = this.world.getObject(playerId);
        if (!player) return;
        this.trigger("craft_item", player.id, itemId);
    }

    chatMessage(playerId: number, message: string) {
        const player = this.world.getObject(playerId);
        if (!player) return;

        if (message.startsWith("/")) {
            const command = message.replace("/", "").split(" ");
            if (command[0] === "give") {
                const item = idMap.get(command[1]);
                const amount = Number(command[2]);
                this.trigger("give_item", player.id, {
                    id: item,
                    amount: amount,
                });
            }
            return;
        }
        this.trigger("chat_message", player.id, message);
    }

    dropItem(playerId: number, itemId: number, all: boolean) {
        const player = this.world.getObject(playerId);
        if (!player) return;

        this.trigger("drop_item", player.id, { id: itemId, all: all });
    }
}
