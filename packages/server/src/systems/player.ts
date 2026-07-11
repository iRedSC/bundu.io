import { moveToward } from "@bundu/shared/transforms";
import {
    decodeMoveDirection,
    PLAYER_MOVE_SPEED,
} from "@bundu/shared/movement";
import { ClientPacket, ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GroundData, Physics } from "../components/base.js";
import {
    Inventory,
    addItem,
    cursorSlot as applyCursorSlot,
    hasItems,
    moveSlot as applyMoveSlot,
    removeItems,
} from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import {
    craftingList,
    packCraftingList,
} from "../configs/loaders/crafting.js";
import { GameObject, System, type World } from "../engine";
import { Attributes } from "../components/attributes.js";
import { emitVitals } from "../network/vitals.js";
import {
    emitEquipment,
    emitInventory,
    syncMainHand,
} from "../network/inventory.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { tryHandleDebugChatCommand } from "../debug/chat_commands.js";
import { SERVER_DEBUG } from "../debug/flag.js";
import { PlaceMode } from "@bundu/shared/inventory";

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

        if (data.crafting && time >= data.crafting.endsAt) {
            this.finishCraft(player);
        }

        if (data.attacking && data.lastAttackTime && !data.blocking && !data.crafting) {
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
        // Fixed step per tick (tps-gated); speed lives on the attribute.
        const speed = attributes?.get("movement.speed") ?? PLAYER_MOVE_SPEED;
        const target = moveToward(
            { x: 0, y: 0 },
            { x: data.moveDir[0], y: data.moveDir[1] },
            speed
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
        const { playerPacketManager, worldPacketManager } = this.world.context;
        playerPacketManager.set(player.id, ServerPacket.LoadGround, {
            groundData: packets,
        });
        playerPacketManager.set(player.id, ServerPacket.RecipeList, {
            recipes: packCraftingList(),
        });
        emitVitals(player, playerPacketManager);
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
    }

    kill({ object: target }: GameEvent.Kill) {
        if (!target.active) return;
        this.clearCraft(target);
        target.active = false;
        this.trigger(GameEvent.DeleteObject, { object: target });
        const { socketManager } = this.world.context;
        const socket = socketManager.getSocket(target.id);
        socketManager.deleteClient(target.id);
        socket?.close();
    }

    private emitCraftEvent(player: GameObject, duration: number) {
        this.world.context.worldPacketManager.emit(ServerPacket.CraftEvent, {
            id: player.id,
            duration,
        });
    }

    private clearCraft(player: GameObject, emit = true) {
        const data = PlayerData.get(player);
        if (!data?.crafting) return;
        data.crafting = undefined;
        if (emit) this.emitCraftEvent(player, 0);
    }

    private finishCraft(player: GameObject) {
        const data = PlayerData.get(player);
        const crafting = data?.crafting;
        if (!data || !crafting) return;

        const recipe = craftingList.get(crafting.itemId);
        const inv = Inventory.get(player);
        data.crafting = undefined;
        this.emitCraftEvent(player, 0);

        if (!recipe || !inv) return;
        if (!removeItems(inv, recipe.ingredients)) return;

        addItem(inv, recipe.id, recipe.amount);
        data.score += recipe.score;

        syncMainHand(player);
        const { playerPacketManager, worldPacketManager } = this.world.context;
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
    }

    craftItem = (playerId: number, { itemId }: ClientPacket.CraftItem) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data || data.crafting) return;

        const recipe = craftingList.get(itemId);
        if (!recipe) return;

        const inv = Inventory.get(player);
        if (!inv || !hasItems(inv, recipe.ingredients)) return;

        // Stop in-progress combat for the channel.
        data.attacking = false;
        if (data.blocking) {
            data.blocking = false;
            player.get(Attributes)?.clear("blocking");
            this.world.context.worldPacketManager.emit(ServerPacket.BlockEvent, {
                id: player.id,
                stop: true,
            });
        }

        data.crafting = {
            itemId,
            endsAt: this.world.gameTime + recipe.duration,
        };
        this.emitCraftEvent(player, recipe.duration);
    };

    move = (playerId: number, packet: ClientPacket.Movement) => {
        const [x, y] = decodeMoveDirection(packet.direction);

        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        // Accept intent while crafting so held keys resume when the channel ends.
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
        if (data.crafting) return;

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
        if (data.crafting) return;
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

    selectItem = (playerId: number, { slot }: ClientPacket.SelectItem) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (data?.crafting) return;
        const inv = Inventory.get(player);
        if (!inv || slot < 0 || slot >= inv.slots.length) return;

        inv.selected = slot;
        syncMainHand(player);
        emitEquipment(player, this.world.context.worldPacketManager);
    };

    moveSlot = (playerId: number, { from, to }: ClientPacket.MoveSlot) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (data?.crafting) return;
        const inv = Inventory.get(player);
        if (!inv) return;
        if (!applyMoveSlot(inv, from, to)) return;

        syncMainHand(player);
        const { playerPacketManager, worldPacketManager } = this.world.context;
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
    };

    cursorSlot = (
        playerId: number,
        { slot, mode }: ClientPacket.CursorSlot
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (data?.crafting) return;
        const inv = Inventory.get(player);
        if (!inv) return;

        const placeMode =
            mode === PlaceMode.Half || mode === PlaceMode.One
                ? mode
                : PlaceMode.All;
        if (!applyCursorSlot(inv, slot, placeMode)) return;

        syncMainHand(player);
        const { playerPacketManager, worldPacketManager } = this.world.context;
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
    };

    placeStructureAt = (
        playerId: number,
        { structureId, x, y, rotation }: ClientPacket.PlaceStructureAt
    ) => {
        if (!SERVER_DEBUG) return;
        const player = this.world.getObject(playerId);
        if (player && PlayerData.get(player)?.crafting) return;
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
            const { playerPacketManager, worldPacketManager } =
                this.world.context;
            emitInventory(player, playerPacketManager);
            syncMainHand(player);
            emitEquipment(player, worldPacketManager);
            return;
        }
        this.world.context.worldPacketManager.emit(ServerPacket.ChatMessage, {
            id: player.id,
            message,
        });
    };
};
