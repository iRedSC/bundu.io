import { moveToward } from "../../../ioengine/lib/transforms.js";
import { ClientPacket, ServerPacket } from "@shared/packet_definitions.js";
import { GroundData, Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { packCraftingList } from "../configs/loaders/crafting.js";
import { GameObject, System } from "@ioengine/server";
import {
    AttributeList,
    Attributes,
    type AttributeType,
} from "../components/attributes.js";
import { StatList, type StatType, Stats } from "../components/stats.js";
import {
    playerPacketManager,
    socketManager,
    worldPacketManager,
} from "../network/managers.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { STRUCTURE_COLLISION_RADIUS } from "./structure.js";

/**
 * Player input + lifecycle. Packet handlers are attack surface — keep them small.
 */
export class PlayerSystem extends System<GameEventMap> {
    constructor() {
        super([PlayerData, Physics]);
        this.listen(GameEvent.Kill, this.kill, [PlayerData]);
    }

    override update(time: number, _delta: number, player: GameObject): void {
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
        if (!target.active) return;
        target.active = false;
        this.trigger(GameEvent.DeleteObject, { object: target });
        const socket = socketManager.getSocket(target.id);
        socketManager.deleteClient(target.id);
        socket?.close();
    }

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

    rotate = (playerId: number, { rotation }: ClientPacket.Rotation) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        this.trigger(GameEvent.Rotate, { object: player, rotation });
    };

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
                    structureSize: STRUCTURE_COLLISION_RADIUS,
                }
            );

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
        worldPacketManager.add(ServerPacket.BlockEvent, {
            id: player.id,
            stop,
        });
    };

    /** Inventory/craft not implemented yet — no-op so the client stays quiet. */
    selectItem = (_playerId: number, _packet: ClientPacket.SelectItem) => {};
    craftItem = (_playerId: number, _packet: ClientPacket.CraftItem) => {};
    dropItem = (_playerId: number, _packet: ClientPacket.DropItem) => {};

    chatMessage = (playerId: number, { message }: ClientPacket.ChatMessage) => {
        const player = this.world.getObject(playerId);
        if (!player) return;

        if (message.startsWith("/")) {
            const command = message.replace("/", "").split(" ");
            if (!command[1]) return;
            switch (command[0]) {
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
}
