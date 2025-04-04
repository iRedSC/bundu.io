import { moveToward, radians } from "../../lib/transforms.js";
import { PACKET } from "../../shared/enums.js";
import { GroundData, Physics } from "../components/base.js";
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
import {
    AttributeList,
    Attributes,
    AttributeType,
} from "../components/attributes.js";
import { StatList, StatType, Stats } from "../components/stats.js";
import { Resource } from "../game_objects/resource.js";
import SAT from "sat";
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
        const attributes = player.get(Attributes);

        if (data.attacking && data.lastAttackTime && !data.blocking) {
            if (
                data.lastAttackTime <
                time - (1 / attributes.get("attack.speed")) * 1000
            ) {
                const damage = attributes.get("attack.damage") ?? 1;
                const start = attributes.get("attack.origin") ?? 0;
                const length = attributes.get("attack.reach") ?? 5;
                const width = attributes.get("attack.sweep") ?? 5;

                this.trigger("attack", player.id, {
                    weapon: data.mainHand,
                    damage,
                    hitbox: { start, length, width },
                });
                attributes?.set(
                    "movement.speed",
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
        const baseSpeed = delta / this.tps;
        const target = moveToward(
            { x: 0, y: 0 },
            { x: data.moveDir[0], y: data.moveDir[1] },
            baseSpeed * attributes?.get("movement.speed", baseSpeed)
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

        const attributes = player.get(Attributes);
        attributes.addEventListener("health.defense", () => {
            this.trigger("give_item", player.id, { id: 56, amount: 1 });
        });
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
        const physics = Physics.get(player);
        const data = PlayerData.get(player);
        const selectedStructure = data.selectedStructure;

        if (selectedStructure.id !== -1) {
            const struct_physics: Physics = {
                position: physics.position.clone(),
                size: 15,
                rotation: physics.rotation + radians(-45),
                collider: new SAT.Circle(physics.position.clone(), 15),
                solid: true,
                speed: 0,
            };
            this.world.addObject(
                new Resource(struct_physics, {
                    id: selectedStructure.id,
                    variant: 0,
                })
            );
            selectedStructure.cooldown_timestamp = Date.now() + 1000;

            GlobalPacketFactory.add(
                player.id,
                [PACKET.SERVER.SELECT_STRUCTURE],
                () => [-1, 1]
            );
            this.trigger("remove_item", player.id, {
                id: selectedStructure.id,
                amount: 1,
            });
            selectedStructure.id = -1;
            return;
        }

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
        const attributes = player.get(Attributes);
        const blocking = attributes.get("health.defense.blocking");
        if (!stop && data.attacking) {
            data.attacking = false;
        }
        data.blocking = !stop;
        if (data.blocking && blocking > 0) {
            attributes?.set("movement.speed", "blocking", "multiply", 0.6);
            attributes?.set("health.defense", "blocking", "add", blocking);
        } else {
            attributes?.clear("blocking");
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
            switch (command[0]) {
                case "give":
                    const item = idMap.get(command[1]);
                    const amount = Number(command[2]);
                    this.trigger("give_item", player.id, {
                        id: item,
                        amount: amount,
                    });
                    break;
                case "attribute": {
                    const type = command[1] as AttributeType;
                    if (!AttributeList.includes(type)) return;
                    const operation = command[2] as "add" | "multiply";
                    if (!["add", "multiply"].includes(operation)) return;
                    const value = Number(command[3]);
                    let duration;
                    if (command[4]) duration = Number(command[4]);
                    player
                        .get(Attributes)
                        .set(type, "command", operation, value, duration);
                    break;
                }
                case "stat": {
                    const type = command[1] as StatType;
                    if (!StatList.includes(type)) return;
                    const value = Number(command[2]);
                    player.get(Stats).set(type, { value });
                    break;
                }
                case "kill": {
                    this.trigger("kill", player.id);
                    break;
                }
                case "godmode": {
                    player
                        .get(Attributes)
                        .set("attack.speed", "godmode", "add", 100)
                        .set("attack.reach", "godmode", "add", 500);
                }
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
