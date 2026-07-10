import { moveToward } from "@bundu/shared/transforms";
import { decodeMoveDirection } from "@bundu/shared/movement";
import { ClientPacket, ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GroundData, Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { packCraftingList } from "../configs/loaders/crafting.js";
import { GameObject, System, type World } from "../engine";
import { Attributes } from "../components/attributes.js";
import { emitVitals } from "../network/vitals.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { tryHandleDebugChatCommand } from "../debug/chat_commands.js";
import { SERVER_DEBUG } from "../debug/flag.js";

/**
 * Player input + lifecycle. Packet handlers are attack surface — keep them small.
 */
export class PlayerSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Physics]);
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
                    500,
                    time
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
        const { playerPacketManager } = this.world.context;
        playerPacketManager.set(player.id, ServerPacket.LoadGround, {
            groundData: packets,
        });
        playerPacketManager.set(player.id, ServerPacket.RecipeList, {
            recipes: packCraftingList(),
        });
        emitVitals(player, playerPacketManager);
    }

    kill({ object: target }: GameEvent.Kill) {
        if (!target.active) return;
        target.active = false;
        this.trigger(GameEvent.DeleteObject, { object: target });
        const { socketManager } = this.world.context;
        const socket = socketManager.getSocket(target.id);
        socketManager.deleteClient(target.id);
        socket?.close();
    }

    move = (playerId: number, packet: ClientPacket.Movement) => {
        const [x, y] = decodeMoveDirection(packet.direction);

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

        // Place-only path: selected structure consumes the attack packet.
        if (data.selectedStructure.id !== -1) {
            this.trigger(GameEvent.PlaceSelectedStructure, { object: player });
            return;
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
        this.world.context.worldPacketManager.emit(ServerPacket.BlockEvent, {
            id: player.id,
            stop,
        });
    };

    placeStructureAt = (
        _playerId: number,
        { structureId, x, y, rotation }: ClientPacket.PlaceStructureAt
    ) => {
        if (!SERVER_DEBUG) return;
        this.trigger(GameEvent.PlaceStructure, {
            structureId,
            x,
            y,
            rotation,
        });
    };

    chatMessage = (playerId: number, { message }: ClientPacket.ChatMessage) => {
        const player = this.world.getObject(playerId);
        if (!player) return;

        if (
            SERVER_DEBUG &&
            tryHandleDebugChatCommand(
                player,
                message,
                (target) => {
                    this.trigger(GameEvent.Kill, { object: target });
                },
                this.world.gameTime
            )
        ) {
            return;
        }
        this.world.context.worldPacketManager.emit(ServerPacket.ChatMessage, {
            id: player.id,
            message,
        });
    };
}
