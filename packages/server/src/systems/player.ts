import { moveToward } from "@bundu/shared/transforms";
import {
    decodeMoveDirection,
    PLAYER_MOVE_SPEED,
} from "@bundu/shared/movement";
import { type ClientPacket, ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GroundData, Health, Physics } from "../components/base.js";
import {
    Inventory,
    canConsumeAndAdd,
    cursorSlot as applyCursorSlot,
    moveSlot as applyMoveSlot,
    removeItem,
    tryConsumeAndAdd,
} from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import {
    craftingList,
    packCraftingList,
} from "../configs/loaders/crafting.js";
import { type GameObject, System, type World } from "../engine";
import { Attributes } from "../components/attributes.js";
import { Stats } from "../components/stats.js";
import { emitVitals } from "../network/vitals.js";
import {
    clearMainHandIf,
    clearMissingEquipment,
    emitEquipment,
    emitInventory,
    selectEquipment,
} from "../network/inventory.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { tryHandleDebugChatCommand } from "../debug/chat_commands.js";
import { CHEAT_PHRASE, SERVER_DEBUG } from "../debug/flag.js";
import { PlaceMode } from "@bundu/shared/inventory";
import { pointToTile, WORLD_BOUNDS, worldToDeci } from "@bundu/shared/tiles";
import { ItemConfigs } from "../configs/loaders/items.js";
import { GroundItem } from "../game_objects/ground_item.js";
import { moveInDirection } from "@bundu/shared/transforms";
import { Circle, Vector } from "sat";

const DROP_DISTANCE = 80;
const DROP_PICKUP_DELAY = 500;

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

        if (data.eating && time >= data.eating.endsAt) {
            this.finishEating(player);
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
        this.clearEating(target);
        target.active = false;
        this.trigger(GameEvent.DeleteObject, { object: target });
        const { socketManager } = this.world.context;
        const socket = socketManager.getSocket(target.id);
        socketManager.deleteClient(target.id);
        socket?.close();
    }

    private emitCraftEvent(player: GameObject, duration: number, itemId = -1) {
        this.world.context.worldPacketManager.emit(ServerPacket.CraftEvent, {
            id: player.id,
            duration,
            itemId,
        });
    }

    private clearCraft(player: GameObject, emit = true) {
        const data = PlayerData.get(player);
        if (!data?.crafting) return;
        data.crafting = undefined;
        if (emit) this.emitCraftEvent(player, 0);
    }

    private clearEating(player: GameObject, emit = true) {
        const data = PlayerData.get(player);
        if (!data?.eating) return;
        data.eating = undefined;
        Attributes.get(player)?.clear("eating");
        if (emit) {
            this.world.context.worldPacketManager.emit(ServerPacket.EatEvent, {
                id: player.id,
                duration: 0,
            });
        }
    }

    private finishEating(player: GameObject) {
        const data = PlayerData.get(player);
        const eating = data?.eating;
        const inventory = Inventory.get(player);
        if (!data || !eating || !inventory) return;

        const config = ItemConfigs.get(eating.itemId);
        if (
            data.offHand !== eating.itemId ||
            config.type !== "food" ||
            !removeItem(inventory, eating.itemId, 1)
        ) {
            this.clearEating(player);
            return;
        }

        const stats = Stats.get(player);
        const hungerAmount = config.stats.hunger ?? 0;
        if (hungerAmount !== 0) {
            const hunger = stats.get("hunger");
            stats.set("hunger", {
                value: Math.min(
                    hunger.value + hungerAmount,
                    config.can_saturate ? 200 : 100
                ),
                min: 0,
                max: 200,
            });
        }

        const healthDelta = config.stats.health ?? 0;
        const health = Health.get(player);
        if (health && healthDelta !== 0) {
            health.value = Math.max(
                0,
                Math.min(health.max, health.value + healthDelta)
            );
        }

        this.clearEating(player);
        clearMissingEquipment(player);
        const { playerPacketManager, worldPacketManager } = this.world.context;
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
        emitVitals(player, playerPacketManager);
    }

    private startEating(player: GameObject, itemId: number) {
        const data = PlayerData.get(player);
        const attributes = Attributes.get(player);
        const config = ItemConfigs.get(itemId);
        if (!data || !attributes || data.eating || config.type !== "food") return;

        data.attacking = false;
        data.eating = {
            itemId,
            endsAt: this.world.gameTime + config.eat_duration_ms,
        };
        attributes.set(
            "movement.speed",
            "eating",
            "multiply",
            attributes.get("eating.movement_speed_multiplier")
        );
        this.world.context.worldPacketManager.emit(ServerPacket.EatEvent, {
            id: player.id,
            duration: config.eat_duration_ms,
        });
    }

    /** Cancel block if equipment no longer grants `health.defense.blocking`. */
    private clearStaleBlocking(player: GameObject) {
        const data = PlayerData.get(player);
        if (!data?.blocking) return;
        const blocking =
            Attributes.get(player)?.get("health.defense.blocking") ?? 0;
        if (blocking > 0) return;

        data.blocking = false;
        Attributes.get(player)?.clear("blocking");
        this.world.context.worldPacketManager.emit(ServerPacket.BlockEvent, {
            id: player.id,
            stop: true,
        });
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
        if (
            !tryConsumeAndAdd(
                inv,
                recipe.ingredients,
                recipe.id,
                recipe.amount
            )
        ) {
            return;
        }

        data.score += recipe.score;

        clearMissingEquipment(player);
        this.syncSelectedStructure(player);
        this.clearStaleBlocking(player);
        const { playerPacketManager, worldPacketManager } = this.world.context;
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
    }

    craftItem = (playerId: number, { itemId }: ClientPacket.CraftItem) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data || data.crafting) return;
        this.clearEating(player);

        const recipe = craftingList.get(itemId);
        if (!recipe) return;

        const inv = Inventory.get(player);
        if (
            !inv ||
            !canConsumeAndAdd(
                inv,
                recipe.ingredients,
                recipe.id,
                recipe.amount
            )
        ) {
            return;
        }

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
        this.emitCraftEvent(player, recipe.duration, recipe.id);
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
        if (data.crafting || data.eating) return;
        if (data.selectedStructure.id !== -1) {
            data.attacking = false;
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
        if (data.eating) {
            if (stop) this.clearEating(player);
            return;
        }
        const attributes = player.get(Attributes);
        const itemId = data.offHand;
        if (
            !stop &&
            itemId !== undefined &&
            ItemConfigs.get(itemId).type === "food"
        ) {
            this.startEating(player, itemId);
            return;
        }
        const blocking = attributes.get("health.defense.blocking");

        if (!stop) {
            if (!(blocking > 0)) return;
            if (data.attacking) data.attacking = false;
            data.blocking = true;
            attributes?.set("movement.speed", "blocking", "multiply", 0.6);
            attributes?.set("health.defense", "blocking", "add", blocking);
        } else {
            data.blocking = false;
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
        this.clearEating(player);
        const inv = Inventory.get(player);
        if (!inv || slot < 0 || slot >= inv.slots.length) return;

        inv.selected = slot;
        selectEquipment(player, inv.slots[slot]?.id);
        this.syncSelectedStructure(player);
        this.clearStaleBlocking(player);
        emitEquipment(player, this.world.context.worldPacketManager);
    };

    moveSlot = (playerId: number, { from, to }: ClientPacket.MoveSlot) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (data?.crafting) return;
        this.clearEating(player);
        const inv = Inventory.get(player);
        if (!inv) return;
        const dropped =
            to === -1 && inv.slots[from]
                ? { ...inv.slots[from] }
                : undefined;
        if (!applyMoveSlot(inv, from, to)) return;
        if (dropped) this.dropItem(player, dropped.id, dropped.count);

        clearMissingEquipment(player);
        this.syncSelectedStructure(player);
        this.clearStaleBlocking(player);
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
        this.clearEating(player);
        const inv = Inventory.get(player);
        if (!inv) return;

        const placeMode =
            mode === PlaceMode.Half || mode === PlaceMode.One
                ? mode
                : PlaceMode.All;
        const amount =
            slot === -1 && inv.cursor
                ? Math.min(
                      inv.cursor.count,
                      placeMode === PlaceMode.Half
                          ? Math.ceil(inv.cursor.count / 2)
                          : placeMode === PlaceMode.One
                            ? 1
                            : inv.cursor.count
                  )
                : 0;
        const itemId = slot === -1 ? inv.cursor?.id : undefined;
        if (!applyCursorSlot(inv, slot, placeMode)) return;
        if (itemId !== undefined && amount > 0) {
            this.dropItem(player, itemId, amount);
        }

        clearMissingEquipment(player);
        this.syncSelectedStructure(player);
        this.clearStaleBlocking(player);
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
            resultTo: player,
            placedBy: player,
        });
    };

    placeStructure = (playerId: number, _packet: ClientPacket.PlaceStructure) => {
        const player = this.world.getObject(playerId);
        if (!player || PlayerData.get(player)?.crafting) return;
        this.trigger(GameEvent.PlaceSelectedStructure, {
            object: player,
        });
    };

    private dropItem(player: GameObject, itemId: number, amount: number) {
        const physics = player.get(Physics);
        const droppedAt = moveInDirection(
            physics.position,
            (physics.rotation * Math.PI) / 180,
            DROP_DISTANCE
        );
        const target = new Vector(
            Math.min(Math.max(droppedAt.x, 0), WORLD_BOUNDS),
            Math.min(Math.max(droppedAt.y, 0), WORLD_BOUNDS)
        );

        const item = new GroundItem(
            {
                position: target,
                collider: new Circle(target, 12),
                rotation: physics.rotation,
                collisionRadius: 12,
                speed: 0,
            },
            { itemId, amount, pickupAt: this.world.gameTime + DROP_PICKUP_DELAY }
        );
        this.world.addObject(item);
        this.world.context.worldPacketManager.emit(ServerPacket.DropItem, {
            id: player.id,
            objectId: item.id,
            itemId,
            x: worldToDeci(target.x),
            y: worldToDeci(target.y),
        });
    }

    setStructurePlacement = (
        playerId: number,
        { rotation, x, y }: ClientPacket.SetStructurePlacement
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        if (
            !Number.isSafeInteger(rotation) ||
            !Number.isSafeInteger(x) ||
            !Number.isSafeInteger(y)
        ) {
            return;
        }

        const selected = player.get(PlayerData).selectedStructure;
        selected.rotation = ((rotation % 4) + 4) % 4;
        selected.cursor = { x, y };
        this.trigger(GameEvent.ValidateSelectedStructure, { object: player });
    };

    private syncSelectedStructure(player: GameObject) {
        const data = player.get(PlayerData);
        const inv = player.get(Inventory);
        const id = inv.slots[inv.selected]?.id;
        const heldBuilding =
            id !== undefined &&
            ItemConfigs.get(id).function === "building" &&
            data.mainHand === id;
        const structureId = heldBuilding ? id : -1;

        if (
            structureId === -1 &&
            data.mainHand !== undefined &&
            ItemConfigs.get(data.mainHand).function === "building"
        ) {
            clearMainHandIf(player, data.mainHand);
        }
        if (data.selectedStructure.id === structureId) return;

        data.selectedStructure.id = structureId;
        if (structureId !== -1) {
            data.selectedStructure.cursor = pointToTile(player.get(Physics).position);
        } else {
            data.attacking = false;
        }
        this.world.context.playerPacketManager.set(
            player.id,
            ServerPacket.SetSelectedStructure,
            { structureId }
        );
        this.trigger(GameEvent.ValidateSelectedStructure, { object: player });
    }

    chatMessage = (playerId: number, { message }: ClientPacket.ChatMessage) => {
        const player = this.world.getObject(playerId);
        if (!player) return;

        if (CHEAT_PHRASE && message === CHEAT_PHRASE) {
            PlayerData.get(player).cheatsEnabled = true;
            return;
        }

        const data = PlayerData.get(player);
        if (
            (data.cheatsEnabled || SERVER_DEBUG) &&
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
            clearMissingEquipment(player);
            this.syncSelectedStructure(player);
            this.clearStaleBlocking(player);
            emitEquipment(player, worldPacketManager);
            return;
        }
        this.world.context.worldPacketManager.emit(ServerPacket.ChatMessage, {
            id: player.id,
            message,
        });
    };
};
