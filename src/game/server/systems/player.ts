import {
    moveInDirection,
    moveToward,
    radians,
} from "../../../ioengine/lib/transforms.js";
import { ClientPacket, ServerPacket } from "@shared/packet_definitions.js";
import { GroundData, Health, Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { Inventory } from "../components/inventory.js";
import { packCraftingList } from "../configs/loaders/crafting.js";
import { GameObject, System } from "@ioengine/server";

import {
    AttributeList,
    Attributes,
    type AttributeType,
} from "../components/attributes.js";
import { StatList, type StatType, Stats } from "../components/stats.js";
import { Circle, Vector } from "sat";
import { type BasicPoint } from "@ioengine/lib";
import { playerPacketManager, socketManager } from "../network/managers.js";
import { Resource } from "../game_objects/resource.js";
import { getNumericId } from "../configs/loaders/id_map.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

/**
 * This is the system that controls players.
 * ! Method calls come directly from client's packets, so it's a potential attack point.
 */
export class PlayerSystem extends System<GameEventMap> {
    constructor() {
        super([PlayerData, Physics]);

        this.listen(GameEvent.Kill, this.kill, [PlayerData]);
    }

    /**
     * Updates each player.
     *
     * Moves them based on their moveDir value.
     * Sends attack event if attacking is true.
     */
    override update(time: number, delta: number, player: GameObject): void {
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

                this.trigger(GameEvent.Attack, {
                    object: player,
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
        // const baseSpeed = delta / this.tps - 1;
        const baseSpeed = 4;
        const target = moveToward(
            { x: 0, y: 0 },
            { x: data.moveDir[0], y: data.moveDir[1] },
            baseSpeed * attributes?.get("movement.speed", baseSpeed)
        );
        this.trigger(GameEvent.Move, {
            object: player,
            x: target.x,
            y: target.y,
        });
    }

    override enter(player: GameObject) {
        const groundObjects = this.world.query([GroundData]);
        const packets = groundObjects.map((ground) => {
            const data = ground.get(GroundData);
            return data.createPacket();
        });
        playerPacketManager.set(player.id, ServerPacket.LoadGround, {
            groundData: packets,
        });
        playerPacketManager.set(player.id, ServerPacket.RecipeList, {
            recipes: packCraftingList(),
        });
        this.trigger(GameEvent.HealthUpdate, { object: player });
    }

    kill({ object: target }: GameEvent.Kill) {
        const inventory = target.get(Inventory);
        const physics = target.get(Physics);

        for (const [id, amount] of inventory.items.entries()) {
            this.trigger(GameEvent.SpawnItem, {
                id,
                amount,
                x: physics.position.x,
                y: physics.position.y,
            });
        }

        this.trigger(GameEvent.DeleteObject, { object: target });
        const socket = socketManager.getSocket(target.id);
        socket?.close();
        socketManager.deleteClient(target.id);
        target.active = false;
    }

    healthUpdate(player: GameObject) {
        const health = player.get(Health);
        const stats = player.get(Stats);

        playerPacketManager.set(player.id, ServerPacket.UpdateVitals, {
            health: health.value,
            hunger: stats.get("hunger").value,
            heat: stats.get("temperature").value,
        });
    }

    // Sets selected player's moveDir property.
    move = (playerId: number, packet: ClientPacket.Movement) => {
        let byte = packet.direction;
        byte--;
        const y = (byte & 0b11) - 1;
        const x = ((byte >> 2) & 0b11) - 1;

        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        data.moveDir = [x, y];
    };

    // Sets selected player's rotation
    rotate = (playerId: number, { rotation }: ClientPacket.Rotation) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        this.trigger(GameEvent.Rotate, { object: player, rotation });
    };

    //! remove this in favor of ObjectsAddedToView
    // Triggers event to send objects to selected player
    requestObjects = (
        playerId: number,
        { objects }: ClientPacket.RequestObjects
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        console.log("Player is requesting objects");

        // this.trigger(GameEvent.SendNewObjects, { object: player, objects });
    };

    // starts or stops a player from attacking
    attack = (playerId: number, { stop }: ClientPacket.Attack) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = player.get(PlayerData);
        const physics = player.get(Physics);
        const selectedStructure = data.selectedStructure;
        const { x, y } = physics.position;

        if (selectedStructure.id !== -1) {
            selectedStructure.cooldown_timestamp = Date.now() + 1000;

            playerPacketManager.set(
                player.id,
                ServerPacket.SetSelectedStructure,
                {
                    structureId: -1,
                    structureSize: 10,
                }
            );

            this.trigger(GameEvent.RemoveItem, {
                object: player,
                id: selectedStructure.id,
                amount: 1,
            });

            this.trigger(GameEvent.PlaceStructure, {
                structureId: selectedStructure.id,
                x,
                y,
                rotation: 0,
            });

            selectedStructure.id = -1;
        }

        data.attacking = !stop;
        if (data.lastAttackTime === undefined) {
            data.lastAttackTime = this.world.gameTime;
        }
    };

    // starts or stops a player from blocking
    block = (playerId: number, { stop }: ClientPacket.Block) => {
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
        this.trigger(GameEvent.Block, { object: player, stop });
    };

    selectItem = (playerId: number, { itemId }: ClientPacket.SelectItem) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        this.trigger(GameEvent.SelectItem, { object: player, id: itemId });
    };

    craftItem = (playerId: number, { itemId }: ClientPacket.CraftItem) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        this.trigger(GameEvent.CraftItem, { object: player, id: itemId });
    };

    chatMessage = (playerId: number, { message }: ClientPacket.ChatMessage) => {
        const player = this.world.getObject(playerId);
        if (!player) return;

        if (message.startsWith("/")) {
            const command = message.replace("/", "").split(" ");
            if (!command[1]) return;
            switch (command[0]) {
                case "give":
                    const item = getNumericId(command[1]);
                    const amount = Number(command[2]);
                    this.trigger(GameEvent.GiveItem, {
                        object: player,
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
                    this.trigger(GameEvent.Kill, { object: player });
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
        this.trigger(GameEvent.ChatMessage, { object: player, message });
    };

    dropItem = (
        playerId: number,
        { itemId, dropAll }: ClientPacket.DropItem
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;

        this.trigger(GameEvent.DropItem, {
            object: player,
            id: itemId,
            all: dropAll,
        });
    };
}
