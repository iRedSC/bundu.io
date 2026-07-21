import {
    moveToward,
    moveInDirection,
    radians,
    degrees,
} from "@bundu/shared/transforms";
import { attackFacingRadians } from "@bundu/shared/attack_box";
import { decodeMoveDirection } from "@bundu/shared/movement";
import { type ClientPacket, ServerPacket } from "@bundu/shared/packet_definitions.js";
import { HitFlash } from "@bundu/shared/hit_flash";
import {
    DecorationData,
    GroundData,
    Health,
    Physics,
    ResourceData,
} from "../components/base.js";
import { Flags } from "../components/flags.js";
import {
    Inventory,
    cursorSlot as applyCursorSlot,
    ensureSlotCapacity,
    hasItems,
    moveSlot as applyMoveSlot,
    removeItem,
    removeItems,
    slotCapacityFor,
    type ItemStack,
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
    receiveItem,
    selectEquipment,
} from "../network/inventory.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { groundWire } from "./ground_wire.js";
import { decorationWire } from "./decoration_wire.js";
import {
    effectiveOpLevel,
    emitCommandRegistry,
    emitCommandResult,
    tryHandleDebugChatCommand,
} from "../debug/chat_commands.js";
import { CHEAT_PHRASE } from "../debug/flag.js";
import { clearEditorHistory } from "../admin/history.js";
import { clearAnimalsFrozenFor } from "../admin/state.js";
import { canUseEditor } from "../admin/auth.js";
import { PlaceMode } from "@bundu/shared/inventory";
import { pointToTile, TILE_SIZE, WORLD_BOUNDS, worldToDeci } from "@bundu/shared/tiles";
import { ItemConfigs } from "../configs/loaders/items.js";
import { GroundItem } from "../game_objects/ground_item.js";
import { Resource } from "../game_objects/resource.js";
import { Circle, Vector } from "sat";
import { gameplayConfig } from "../configs/gameplay.js";
import { syncFlags } from "../network/flags.js";
import type { RenderDistanceSystem } from "./render_distance.js";
import type { FreecamGhostSystem } from "./freecam_ghost.js";
import type { CreativeModeSystem } from "../creative/mode.js";
import { getAnonProxyId } from "./anon_occlusion.js";
import { gameRegistries } from "../configs/registries.js";

/**
 * Player input + lifecycle. Packet handlers are attack surface — keep them small.
 */
export class PlayerSystem extends System<GameEventMap> {
    private renderDistanceSystem?: RenderDistanceSystem;
    private freecamGhostSystem?: FreecamGhostSystem;
    private creativeModeSystem?: CreativeModeSystem;

    constructor(world: World) {
        super(world, [PlayerData, Physics]);
        this.listen(GameEvent.Kill, this.kill, [PlayerData]);
    }

    setRenderDistanceSystem(system: RenderDistanceSystem): void {
        this.renderDistanceSystem = system;
    }

    setFreecamGhostSystem(system: FreecamGhostSystem): void {
        this.freecamGhostSystem = system;
    }

    setCreativeModeSystem(system: CreativeModeSystem): void {
        this.creativeModeSystem = system;
    }

    override update(time: number, _delta: number, player: GameObject): void {
        // Soft-disconnect parks intent/combat only — vitals still tick without a socket.
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
        if (data.freecam) {
            this.freecamGhostSystem?.despawnFor(player.id);
        }
        // Client will rebuild; drop stale ghost Load tracking for this viewer.
        this.freecamGhostSystem?.clearViewer(player.id);
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
            // Ghost was cleared on disconnect park — recreate for this session.
            this.freecamGhostSystem?.clearViewer(player.id);
            this.freecamGhostSystem?.spawnFor(player);
            this.freecamGhostSystem?.reconcileViewer(player);
            return;
        }

        this.renderDistanceSystem?.loadView(player);
        this.freecamGhostSystem?.clearViewer(player.id);
        this.freecamGhostSystem?.reconcileViewer(player);
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
        const inv = Inventory.get(player);
        if (inv && data?.backpack) {
            ensureSlotCapacity(inv, slotCapacityFor(true));
        }
        emitInventory(player, playerPacketManager);
        emitEquipment(player, worldPacketManager);
        emitCommandRegistry(
            player.id,
            effectiveOpLevel(data),
            playerPacketManager
        );
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

        const physics = target.get(Physics);
        const scale = target.get(Attributes).get("physics.scale");
        const lootStacks = inventoryLoot(Inventory.get(target));
        const position = new Vector(physics.position.x, physics.position.y);
        const rotation = degrees(
            attackFacingRadians(radians(physics.rotation))
        );

        const data = PlayerData.get(target);
        if (data) data.sessionId = undefined;
        clearAnimalsFrozenFor(target.id);
        clearEditorHistory(target.id);
        this.freecamGhostSystem?.despawnFor(target.id);
        target.active = false;
        this.trigger(GameEvent.DeleteObject, { object: target });

        this.spawnPlayerCorpse(position, rotation, scale, lootStacks);

        // Defer hard-close until after this tick's packet flush so the dying
        // client still receives final combat FX. Corpse / self-delete are not
        // sent to them (see RenderDistanceSystem); client also ignores those.
        const { socketManager, pendingSessionEnds } = this.world.context;
        if (socketManager.getSocket(target.id)) {
            pendingSessionEnds.push({ playerId: target.id });
        }
    }

    private spawnPlayerCorpse(
        position: Vector,
        rotation: number,
        scale: number,
        lootStacks: ItemStack[]
    ) {
        const baseRadius = TILE_SIZE / 2;
        const corpse = new Resource(
            {
                position,
                collider: new Circle(position, baseRadius),
                collisionRadius: baseRadius,
                rotation,
                speed: 0,
            },
            {
                id: gameRegistries().resource.resolve("player_dead", "bundu"),
                variant: "base",
            },
            undefined,
            scale
        );
        const resource = corpse.get(ResourceData);
        resource.lootStacks = lootStacks;
        resource.quantity = lootStacks.length;
        resource.maximumQuantity = lootStacks.length;
        resource.lootTableId = null;
        this.world.addObject(corpse);
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

        const thirstAmount = config.stats.thirst ?? 0;
        if (thirstAmount !== 0) {
            const thirst = stats.get("thirst");
            const thirstMax = thirst.max ?? 100;
            stats.set("thirst", {
                value: Math.min(thirst.value + thirstAmount, thirstMax),
                min: 0,
                max: thirstMax,
            });
        }

        const healthDelta = config.stats.health ?? 0;
        const health = Health.get(player);
        const { playerPacketManager, worldPacketManager } = this.world.context;
        if (health && healthDelta !== 0) {
            const before = health.value;
            health.value = Math.max(
                0,
                Math.min(health.max, health.value + healthDelta)
            );
            if (health.value > before) {
                worldPacketManager.emit(ServerPacket.HitEvent, {
                    id: player.id,
                    angle: 0,
                    strength: 0,
                    flash: HitFlash.Heal,
                });
            }
        }

        this.clearEating(player);
        clearMissingEquipment(player, playerPacketManager);
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
        if (!removeItems(inv, recipe.ingredients)) return;
        const remaining = receiveItem(player, recipe.resultItemId, recipe.amount);
        if (remaining > 0) {
            this.dropItem(player, recipe.resultItemId, remaining);
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
        const result = ItemConfigs.get(recipe.resultItemId);
        if (
            !inv ||
            !this.hasCraftingRequirements(player, recipe.flags) ||
            !hasItems(inv, recipe.ingredients) ||
            (result.function === "backpack" && data.backpack)
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

        const { playerPacketManager, worldPacketManager, dayCycle, socketManager } =
            this.world.context;
        const data = PlayerData.get(player);

        if (CHEAT_PHRASE && message === CHEAT_PHRASE) {
            if (data) {
                data.opLevel = 4;
                data.cheatsEnabled = true;
            }
            const opLevel = effectiveOpLevel(data);
            emitCommandRegistry(player.id, opLevel, playerPacketManager);
            emitCommandResult(
                player.id,
                `Operator level set to ${opLevel}`,
                true,
                playerPacketManager
            );
            return;
        }

        const command = tryHandleDebugChatCommand(player, message, {
            world: this.world,
            onKill: (target) => {
                this.trigger(GameEvent.Kill, { object: target });
            },
            now: this.world.gameTime,
            onSetTime: (period) => {
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
            onFreecam: (target) => this.toggleFreecam(target),
            onCreative: (target) => this.creativeModeSystem?.toggleCreative(target),
        });

        if (command.handled) {
            if (command.message !== undefined && command.ok !== undefined) {
                emitCommandResult(
                    player.id,
                    command.message,
                    command.ok,
                    playerPacketManager
                );
            }
            if (command.ok) {
                emitInventory(player, playerPacketManager);
                clearMissingEquipment(player, playerPacketManager);
                this.syncSelectedStructure(player);
                this.clearStaleBlocking(player);
                emitEquipment(player, worldPacketManager);
            }
            return;
        }

        if (data?.freecam && this.freecamGhostSystem?.emitChat(player.id, message)) {
            // Owner still gets a log line via their body id (no ghost on their client).
            playerPacketManager.add(player.id, ServerPacket.ChatMessage, {
                id: player.id,
                message,
            });
            return;
        }

        worldPacketManager.emit(ServerPacket.ChatMessage, {
            id: player.id,
            message,
        });
        const proxyId = getAnonProxyId(player.id);
        if (proxyId !== undefined) {
            worldPacketManager.emit(ServerPacket.ChatMessage, {
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

    /** Exit freecam at a world point (drag-drop from the freecam player icon). */
    exitFreecamAt = (
        playerId: number,
        { x, y }: ClientPacket.ExitFreecamAt
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player) || !this.renderDistanceSystem) {
            return;
        }
        const physics = Physics.get(player);
        if (!physics) return;
        physics.position.x = Math.min(Math.max(x, 0), WORLD_BOUNDS);
        physics.position.y = Math.min(Math.max(y, 0), WORLD_BOUNDS);
        clearAnimalsFrozenFor(player.id);
        clearEditorHistory(player.id);
        this.freecamGhostSystem?.despawnFor(player.id);
        this.renderDistanceSystem.exitFreecam(player);
        this.freecamGhostSystem?.reconcileViewer(player);
    };

    freecamCursor = (
        playerId: number,
        { x, y }: ClientPacket.FreecamCursor
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.freecam || !data.clientReady) return;
        this.freecamGhostSystem?.setCursor(playerId, x, y);
    };

    private toggleFreecam(player: GameObject): void {
        const data = PlayerData.get(player);
        if (!data || !this.renderDistanceSystem) return;
        if (data.freecam) {
            clearAnimalsFrozenFor(player.id);
            clearEditorHistory(player.id);
            this.freecamGhostSystem?.despawnFor(player.id);
            this.renderDistanceSystem.exitFreecam(player);
            this.freecamGhostSystem?.reconcileViewer(player);
            return;
        }
        this.clearCraft(player, false);
        this.clearEating(player, false);
        const attributes = Attributes.get(player);
        if (attributes) clearEphemeralPlayerAttributeSources(attributes);
        clearEphemeralPlayerIntent(data);
        this.renderDistanceSystem.enterFreecam(player);
        this.freecamGhostSystem?.spawnFor(player);
        this.freecamGhostSystem?.reconcileViewer(player);
    }
}

function inventoryLoot(inventory: Inventory | undefined): ItemStack[] {
    if (!inventory) return [];
    const stacks: ItemStack[] = [];
    for (const slot of inventory.slots) {
        if (slot) stacks.push({ id: slot.id, count: slot.count });
    }
    if (inventory.cursor) {
        stacks.push({ id: inventory.cursor.id, count: inventory.cursor.count });
    }
    return stacks;
}
