import {
    moveToward,
    moveInDirection,
    radians,
} from "@bundu/shared/transforms";
import { attackFacingRadians } from "@bundu/shared/attack_box";
import { decodeMoveDirection } from "@bundu/shared/movement";
import { SESSION_ENDED_CLOSE } from "@bundu/shared/session";
import { type ClientPacket, ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    DecorationData,
    GroundData,
    Health,
    Physics,
} from "../components/base.js";
import { Flags } from "../components/flags.js";
import {
    Inventory,
    canConsumeAndAdd,
    cursorSlot as applyCursorSlot,
    moveSlot as applyMoveSlot,
    removeItem,
    tryConsumeAndAdd,
} from "../components/inventory.js";
import {
    clearEphemeralPlayerAttributeSources,
    clearEphemeralPlayerIntent,
    PlayerData,
} from "../components/player.js";
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
import { groundWire } from "./ground_wire.js";
import { decorationWire } from "./decoration_wire.js";
import { tryHandleDebugChatCommand } from "../debug/chat_commands.js";
import { CHEAT_PHRASE, SERVER_DEBUG } from "../debug/flag.js";
import { clearEditorHistory } from "../admin/history.js";
import { clearAnimalsFrozenFor } from "../admin/state.js";
import { PlaceMode } from "@bundu/shared/inventory";
import { pointToTile, WORLD_BOUNDS, worldToDeci } from "@bundu/shared/tiles";
import { ItemConfigs } from "../configs/loaders/items.js";
import { GroundItem } from "../game_objects/ground_item.js";
import { Circle, Vector } from "sat";
import { gameplayConfig } from "../configs/gameplay.js";
import { syncFlags } from "../network/flags.js";
import type { RenderDistanceSystem } from "./render_distance.js";
import { getAnonProxyId } from "./anon_occlusion.js";

/**
 * Player input + lifecycle. Packet handlers are attack surface — keep them small.
 */
export class PlayerSystem extends System<GameEventMap> {
    private renderDistanceSystem?: RenderDistanceSystem;

    constructor(world: World) {
        super(world, [PlayerData, Physics]);
        this.listen(GameEvent.Kill, this.kill, [PlayerData]);
    }

    setRenderDistanceSystem(system: RenderDistanceSystem): void {
        this.renderDistanceSystem = system;
    }

    override update(time: number, _delta: number, player: GameObject): void {
        // Soft-disconnected players stay alive but ignore sim intent / channels.
        if (!this.world.context.socketManager.getSocket(player.id)) return;
        const data = PlayerData.get(player);
        // Waiting for ClientReady, or freecam: body parked — no combat/move ticks.
        if (!data?.clientReady || data.freecam) return;

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
                    gameplayConfig().player.attackMovementMultiplier,
                    gameplayConfig().player.attackMovementDurationMs,
                    time
                );
                data.lastAttackTime = time;
            }
        }
        if (data.moveDir[0] === 0 && data.moveDir[1] === 0) {
            return;
        }
        // Fixed step per tick (tps-gated); speed lives on the attribute.
        const speed = attributes.get("movement.speed");
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

    /** Clear ephemeral intent when the socket detaches (player stays alive). */
    parkDisconnected(player: GameObject) {
        const data = PlayerData.get(player);
        if (!data) return;
        data.clientReady = false;
        // clearCraft/clearEating before intent wipe so channel side effects still run.
        this.clearCraft(player, false);
        this.clearEating(player, false);
        const attributes = Attributes.get(player);
        if (attributes) clearEphemeralPlayerAttributeSources(attributes);
        clearEphemeralPlayerIntent(data);
        clearAnimalsFrozenFor(player.id);
        clearEditorHistory(player.id);
    }

    /**
     * Client finished local load — enter the world (first spawn) and/or loadView.
     */
    clientReady = (playerId: number, _packet: ClientPacket.ClientReady) => {
        const player = this.world.getObject(playerId);
        if (!player?.active) return;
        const data = PlayerData.get(player);
        if (!data || data.clientReady) return;
        data.clientReady = true;

        if (data.pendingSpawn) {
            data.pendingSpawn = false;
            const physics = Physics.get(player);
            if (physics) {
                this.world.context.quadtree.insert(player.id, physics.position);
                this.renderDistanceSystem?.newObject({ object: player });
            }
        }

        if (data.freecam) {
            data.freecamView = undefined;
            this.world.context.quadtree.delete(player.id);
            this.renderDistanceSystem?.ensureSelfVisible(player);
            this.world.context.playerPacketManager.set(
                player.id,
                ServerPacket.FreecamMode,
                { enabled: true }
            );
            return;
        }

        this.renderDistanceSystem?.loadView(player);
    };

    /**
     * Socket bind sync - sole place for client-only spawn packets.
     * System `enter` stays free of client delivery (indexing only).
     */
    syncSession(player: GameObject) {
        const data = PlayerData.get(player);
        if (data) data.clientReady = false;
        const packets = [...this.world.query([GroundData])]
            .sort((a, b) => a.id - b.id)
            .map((ground) => groundWire(ground));
        const decorations = [...this.world.query([DecorationData])]
            .sort((a, b) => a.id - b.id)
            .map((decoration) => decorationWire(decoration));
        const { playerPacketManager, worldPacketManager, dayCycle } =
            this.world.context;
        playerPacketManager.set(player.id, ServerPacket.ClientConnectionInfo, {
            playerId: player.id,
        });
        playerPacketManager.set(player.id, ServerPacket.LoadGround, {
            groundData: packets,
        });
        playerPacketManager.set(player.id, ServerPacket.LoadDecorations, {
            decorations,
        });
        playerPacketManager.set(player.id, ServerPacket.RecipeList, {
            recipes: packCraftingList(),
        });
        dayCycle.syncClock(this.world.gameTime);
        dayCycle.applyAmbient(player);
        dayCycle.syncPlayer(player.id, playerPacketManager);
        emitVitals(player, playerPacketManager);
        syncFlags(player, playerPacketManager, true);
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
        if (data?.freecam) {
            playerPacketManager.set(player.id, ServerPacket.FreecamMode, {
                enabled: true,
            });
        }
    }

    kill({ object: target }: GameEvent.Kill) {
        if (!target.active) return;
        this.clearCraft(target);
        this.clearEating(target);
        const data = PlayerData.get(target);
        if (data) data.sessionId = undefined;
        clearAnimalsFrozenFor(target.id);
        clearEditorHistory(target.id);
        target.active = false;
        this.trigger(GameEvent.DeleteObject, { object: target });
        const { socketManager } = this.world.context;
        const socket = socketManager.getSocket(target.id);
        socketManager.deleteClient(target.id);
        socket?.close(SESSION_ENDED_CLOSE, "session ended");
    }

    private emitCraftEvent(
        player: GameObject,
        duration: number,
        recipeId = -1,
        itemId = -1
    ) {
        this.world.context.worldPacketManager.emit(ServerPacket.CraftEvent, {
            id: player.id,
            duration,
            recipeId,
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
                    config.can_saturate
                        ? gameplayConfig().player.hungerSaturationLimit
                        : gameplayConfig().player.hungerNormalLimit
                ),
                min: 0,
                max: gameplayConfig().player.hungerSaturationLimit,
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
        clearMissingEquipment(player, this.world.context.playerPacketManager);
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

    private hasCraftingRequirements(
        player: GameObject,
        required: readonly number[]
    ): boolean {
        if (required.length === 0) return true;
        const flags = Flags.get(player);
        if (!flags) return false;
        return required.every((flag) => flags.has(flag));
    }

    private finishCraft(player: GameObject) {
        const data = PlayerData.get(player);
        const crafting = data?.crafting;
        if (!data || !crafting) return;

        const recipe = craftingList.get(crafting.recipeId);
        const inv = Inventory.get(player);
        data.crafting = undefined;
        this.emitCraftEvent(player, 0);

        if (!recipe || !inv || !this.hasCraftingRequirements(player, recipe.flags)) {
            return;
        }
        if (
            !tryConsumeAndAdd(
                inv,
                recipe.ingredients,
                recipe.resultItemId,
                recipe.amount
            )
        ) {
            return;
        }

        data.score += recipe.score;

        clearMissingEquipment(player, this.world.context.playerPacketManager);
        this.syncSelectedStructure(player);
        this.clearStaleBlocking(player);
        const { playerPacketManager, worldPacketManager } = this.world.context;
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
    }

    craftItem = (playerId: number, { recipeId }: ClientPacket.CraftItem) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.clientReady || data.crafting) return;
        this.clearEating(player);

        const recipe = craftingList.get(recipeId);
        if (!recipe) return;

        const inv = Inventory.get(player);
        if (
            !inv ||
            !this.hasCraftingRequirements(player, recipe.flags) ||
            !canConsumeAndAdd(
                inv,
                recipe.ingredients,
                recipe.resultItemId,
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
            recipeId,
            endsAt: this.world.gameTime + recipe.duration,
        };
        this.emitCraftEvent(
            player,
            recipe.duration,
            recipe.id,
            recipe.resultItemId
        );
    };

    move = (playerId: number, packet: ClientPacket.Movement) => {
        const [x, y] = decodeMoveDirection(packet.direction);

        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.clientReady || data.freecam) {
            if (data) data.moveDir = [0, 0];
            return;
        }
        // Accept intent while crafting so held keys resume when the channel ends.
        data.moveDir = [x, y];
    };

    rotate = (playerId: number, { rotation }: ClientPacket.Rotation) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.clientReady || data.freecam) return;
        this.trigger(GameEvent.Rotate, { object: player, rotation });
    };

    attack = (playerId: number, { stop }: ClientPacket.Attack) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.clientReady || data.freecam) return;
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
        if (!data?.clientReady || data.freecam) return;
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
            attributes.set(
                "movement.speed",
                "blocking",
                "multiply",
                gameplayConfig().player.blockingMovementMultiplier
            );
            attributes.set("health.defense", "blocking", "add", blocking);
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
        if (!data?.clientReady || data.crafting) return;
        this.clearEating(player);
        const inv = Inventory.get(player);
        if (!inv || slot < 0 || slot >= inv.slots.length) return;

        inv.selected = slot;
        selectEquipment(
            player,
            inv.slots[slot]?.id,
            this.world.context.playerPacketManager
        );
        this.syncSelectedStructure(player);
        this.clearStaleBlocking(player);
        emitEquipment(player, this.world.context.worldPacketManager);
    };

    moveSlot = (playerId: number, { from, to }: ClientPacket.MoveSlot) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.clientReady || data.crafting) return;
        this.clearEating(player);
        const inv = Inventory.get(player);
        if (!inv) return;
        const dropped =
            to === -1 && inv.slots[from]
                ? { ...inv.slots[from] }
                : undefined;
        if (!applyMoveSlot(inv, from, to)) return;
        if (dropped) this.dropItem(player, dropped.id, dropped.count);

        clearMissingEquipment(player, this.world.context.playerPacketManager);
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
        if (!data?.clientReady || data.crafting) return;
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

        clearMissingEquipment(player, this.world.context.playerPacketManager);
        this.syncSelectedStructure(player);
        this.clearStaleBlocking(player);
        const { playerPacketManager, worldPacketManager } = this.world.context;
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
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
        const config = gameplayConfig().items;
        const droppedAt = moveInDirection(
            physics.position,
            attackFacingRadians(radians(physics.rotation)),
            config.dropDistance
        );
        const target = new Vector(
            Math.min(Math.max(droppedAt.x, 0), WORLD_BOUNDS),
            Math.min(Math.max(droppedAt.y, 0), WORLD_BOUNDS)
        );

        const item = new GroundItem(
            {
                position: target,
                collider: new Circle(target, config.groundCollisionRadius),
                rotation: physics.rotation,
                collisionRadius: config.groundCollisionRadius,
                speed: 0,
            },
            {
                itemId,
                amount,
                pickupAt: this.world.gameTime + config.dropPickupDelayMs,
            }
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
        const itemId = inv.slots[inv.selected]?.id;
        const item = itemId === undefined ? undefined : ItemConfigs.get(itemId);
        let structureId = -1;
        let selectedItemId = -1;
        if (
            itemId !== undefined &&
            item?.function === "building" &&
            item.places !== null &&
            data.mainHand === itemId
        ) {
            structureId = item.places;
            selectedItemId = itemId;
        }

        if (
            structureId === -1 &&
            data.mainHand !== undefined &&
            ItemConfigs.get(data.mainHand).function === "building"
        ) {
            clearMainHandIf(
                player,
                data.mainHand,
                this.world.context.playerPacketManager
            );
        }
        if (
            data.selectedStructure.id === structureId &&
            data.selectedStructure.itemId === selectedItemId
        ) {
            return;
        }

        data.selectedStructure.id = structureId;
        data.selectedStructure.itemId = selectedItemId;
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
                this.world.gameTime,
                (period) => {
                    const { dayCycle, playerPacketManager, socketManager } =
                        this.world.context;
                    const players = this.world
                        .query([PlayerData])
                        .filter((target) => socketManager.getSocket(target.id));
                    return dayCycle.setPeriod(
                        period,
                        this.world.gameTime,
                        players,
                        playerPacketManager
                    );
                },
                (target) => this.toggleFreecam(target)
            )
        ) {
            const { playerPacketManager, worldPacketManager } =
                this.world.context;
            emitInventory(player, playerPacketManager);
            clearMissingEquipment(player, this.world.context.playerPacketManager);
            this.syncSelectedStructure(player);
            this.clearStaleBlocking(player);
            emitEquipment(player, worldPacketManager);
            return;
        }
        this.world.context.worldPacketManager.emit(ServerPacket.ChatMessage, {
            id: player.id,
            message,
        });
        const proxyId = getAnonProxyId(player.id);
        if (proxyId !== undefined) {
            this.world.context.worldPacketManager.emit(ServerPacket.ChatMessage, {
                id: proxyId,
                message,
            });
        }
    };

    viewBounds = (playerId: number, packet: ClientPacket.ViewBounds) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        if (!PlayerData.get(player)?.clientReady) return;
        this.renderDistanceSystem?.setViewBounds(player, packet);
    };

    private toggleFreecam(player: GameObject): void {
        const data = PlayerData.get(player);
        if (!data || !this.renderDistanceSystem) return;
        if (data.freecam) {
            clearAnimalsFrozenFor(player.id);
            clearEditorHistory(player.id);
            this.renderDistanceSystem.exitFreecam(player);
            return;
        }
        this.clearCraft(player, false);
        this.clearEating(player, false);
        const attributes = Attributes.get(player);
        if (attributes) clearEphemeralPlayerAttributeSources(attributes);
        clearEphemeralPlayerIntent(data);
        this.renderDistanceSystem.enterFreecam(player);
    }
};
