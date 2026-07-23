import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    FOOTPRINT_CIRCLE_RADIUS,
    TILE_SIZE,
    WORLD_TILES,
    footprintCenter,
    structureOriginAtPoint,
    tileCenterWorld,
    type TilePos,
    type TileRot,
} from "@bundu/shared";
import { hasOwnedClearTileLine } from "./tile_line.js";
import { Circle, testCircleCircle, Vector } from "sat";
import {
    Health,
    Physics,
    Spiked,
    TileEntity,
    Type,
} from "../components/base.js";
import { Inventory } from "../components/inventory.js";
import { FreecamGhostData } from "../components/freecam_ghost.js";
import { PlayerData } from "../components/player.js";
import { Attributes } from "../components/attributes.js";
import { System, type GameObject, type World } from "../engine";
import { Structure } from "../game_objects/structure.js";
import {
    makeTileEntity,
    tileEntityPhysics,
} from "../game_objects/tile_entity.js";
import { topGroundAt } from "./ground_at.js";
import {
    emitEquipment,
    emitInventory,
    clearMainHandIf,
    clearMissingEquipment,
    equipContext,
} from "../network/inventory.js";
import { syncStructureStates } from "../network/object_state.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import {
    BuildingConfigs,
    occupancyLayerForClass,
    structureUpgradeGroup,
    type BuildingConfig,
} from "../configs/loaders/buildings.js";
import { stackAllowedForBuilding } from "../configs/loaders/placement_rules.js";

type PlacementResult = {
    allowed: boolean;
    x: number;
    y: number;
    rotation: number;
};

export class StructureSystem extends System<GameEventMap> {
    private readonly reachListeners = new Map<number, () => void>();
    private readonly lastPlacementResult = new Map<number, string>();

    constructor(world: World) {
        super(world, [PlayerData, Attributes], 1);
        this.listen(GameEvent.PlaceStructure, this.placeStructure);
        this.listen(
            GameEvent.PlaceSelectedStructure,
            this.placeSelectedStructure
        );
        this.listen(
            GameEvent.ValidateSelectedStructure,
            this.validateSelectedStructure,
            [PlayerData]
        );
        this.listen(GameEvent.Move, this.validateSelectedStructure, [PlayerData]);
        this.listen(GameEvent.Kill, this.kill, [Health, TileEntity]);
    }

    override enter(player: GameObject) {
        const validate = () => this.validateSelectedStructure({ object: player });
        player.get(Attributes).addEventListener("placement.reach", validate);
        this.reachListeners.set(player.id, validate);
    }

    override exit(player: GameObject) {
        const validate = this.reachListeners.get(player.id);
        if (validate) {
            player.get(Attributes).removeEventListener("placement.reach", validate);
            this.reachListeners.delete(player.id);
        }
        this.lastPlacementResult.delete(player.id);
    }

    placeSelectedStructure({ object: player }: GameEvent.PlaceSelectedStructure) {
        const data = player.get(PlayerData);
        const inv = player.get(Inventory);
        const selected = inv.slots[inv.selected];
        const { id: structureId, itemId } = data.selectedStructure;
        const placement = this.selectedPlacement(player);

        let allowed = placement?.allowed ?? false;
        if (allowed && placement) {
            allowed = this.placeStructure({
                structureId,
                x: placement.origin.x,
                y: placement.origin.y,
                rotation: placement.rotation,
                placedBy: player,
            });
        }

        if (allowed && selected) {
            selected.count--;
            if (selected.count <= 0) inv.slots[inv.selected] = null;
            emitInventory(player, this.world.context.playerPacketManager);
        }

        if (!inv.slots[inv.selected] || inv.slots[inv.selected]?.id !== itemId) {
            data.selectedStructure.id = -1;
            data.selectedStructure.itemId = -1;
            clearMainHandIf(
                player,
                itemId,
                equipContext(this.world)
            );
            this.world.context.playerPacketManager.set(
                player.id,
                ServerPacket.SetSelectedStructure,
                { structureId: -1 }
            );
        }

        clearMissingEquipment(
            player,
            equipContext(this.world)
        );
        emitEquipment(player, this.world.context.worldPacketManager);

        // Always notify after a place attempt — validate may have already sent the
        // same allowed/origin key, and the client needs the place signal.
        this.lastPlacementResult.delete(player.id);
        this.sendPlacementResult(player.id, {
            allowed,
            x: placement?.origin.x ?? 0,
            y: placement?.origin.y ?? 0,
            rotation: placement?.rotation ?? 0,
        });
        if (data.selectedStructure.id === -1) {
            this.lastPlacementResult.delete(player.id);
        }
    }

    validateSelectedStructure = ({ object }: { object: GameObject }) => {
        if (object.get(PlayerData).selectedStructure.id === -1) {
            this.lastPlacementResult.delete(object.id);
            return;
        }
        const placement = this.selectedPlacement(object);
        this.sendPlacementResult(object.id, {
            allowed: placement?.allowed ?? false,
            x: placement?.origin.x ?? 0,
            y: placement?.origin.y ?? 0,
            rotation: placement?.rotation ?? 0,
        });
    };

    private kill = ({ object }: GameEvent.Kill) => {
        if (!object.active) return;
        object.active = false;
        this.trigger(GameEvent.DeleteObject, { object });
    };

    private sendPlacementResult(playerId: number, result: PlacementResult) {
        const key = `${result.allowed},${result.x},${result.y},${result.rotation}`;
        if (this.lastPlacementResult.get(playerId) === key) return;
        this.lastPlacementResult.set(playerId, key);
        this.world.context.playerPacketManager.set(
            playerId,
            ServerPacket.PlaceStructureResult,
            result
        );
    }

    private selectedPlacement(player: GameObject) {
        const data = player.get(PlayerData);
        const physics = player.get(Physics);
        const inv = player.get(Inventory);
        const selected = inv.slots[inv.selected];
        const { id, itemId, rotation, cursor } = data.selectedStructure;
        const rot = normalizeRotation(rotation);
        if (id === -1 || selected?.id !== itemId || rot === undefined) {
            return undefined;
        }

        const config = BuildingConfigs.get(id);
        const def = config.placement;
        const reach = Math.max(0, player.get(Attributes).get("placement.reach"));
        const origin = structureOriginAtPoint(cursor, def.blocked, rot);
        const tile = makeTileEntity(
            origin,
            rot,
            def.blocked,
            occupancyLayerForClass(config.class)
        );
        const center = footprintCenter(def.blocked, rot);
        const inReach =
            Math.hypot(
                tileCenterWorld(origin.x) + center.x * TILE_SIZE - physics.position.x,
                tileCenterWorld(origin.y) + center.y * TILE_SIZE - physics.position.y
            ) <= reach;
        const lineClear = hasOwnedClearTileLine(
            this.world,
            physics.position,
            cursor,
            player.id
        );
        return {
            origin,
            rotation: rot,
            allowed:
                inReach &&
                lineClear &&
                this.canPlaceIntent(config, tile.occupied, player.id, id),
        };
    }

    /** @returns true if the structure was added / attached / upgraded. */
    placeStructure({
        structureId,
        x,
        y,
        rotation,
        variant,
        resultTo,
        placedBy,
    }: GameEvent.PlaceStructure): boolean {
        const allowed = this.tryPlaceStructure(
            structureId,
            x,
            y,
            rotation,
            placedBy?.id,
            variant
        );
        if (resultTo) {
            this.world.context.playerPacketManager.set(
                resultTo.id,
                ServerPacket.PlaceStructureResult,
                {
                    allowed,
                    x,
                    y,
                    rotation,
                }
            );
        }
        return allowed;
    }

    private tryPlaceStructure(
        structureId: number,
        x: number,
        y: number,
        rotation: number,
        ownerId?: number,
        variant?: string
    ): boolean {
        if (!Number.isInteger(x) || !Number.isInteger(y)) return false;

        const rot = normalizeRotation(rotation);
        if (rot === undefined) return false;
        const origin = { x, y };
        const config = BuildingConfigs.get(structureId);
        const def = config.placement;
        const tile = makeTileEntity(
            origin,
            rot,
            def.blocked,
            occupancyLayerForClass(config.class)
        );

        if (config.class === "spike") {
            return this.tryAttachSpike(config, tile.occupied, ownerId);
        }

        if (config.class === "wall" || config.class === "door") {
            const occupant = this.uniformOccupant(tile.occupied);
            if (occupant) {
                return this.tryUpgradeStructure(
                    structureId,
                    config,
                    occupant,
                    ownerId
                );
            }
        }

        tile.ownerId = ownerId;
        if (!this.canPlaceEmpty(structureId, config, tile.occupied)) {
            return false;
        }

        this.world.addObject(
            new Structure(
                tileEntityPhysics(origin, rot),
                variant ? { id: structureId, variant } : { id: structureId },
                tile
            )
        );
        return true;
    }

    private canPlaceIntent(
        config: BuildingConfig,
        occupied: readonly TilePos[],
        placerId: number,
        structureId: number
    ): boolean {
        if (config.class === "spike") {
            return this.canAttachSpike(config, occupied, placerId);
        }
        if (config.class === "wall" || config.class === "door") {
            const occupant = this.uniformOccupant(occupied);
            if (occupant) {
                return this.canUpgradeStructure(config, occupant, placerId);
            }
        }
        return this.canPlaceEmpty(structureId, config, occupied);
    }

    private tryAttachSpike(
        spike: BuildingConfig,
        occupied: readonly TilePos[],
        placerId?: number
    ): boolean {
        if (placerId === undefined) return false;
        const target = this.attachTarget(spike, occupied, placerId);
        if (!target) return false;
        target.add(new Spiked());
        syncStructureStates(this.world, target);
        return true;
    }

    private canAttachSpike(
        spike: BuildingConfig,
        occupied: readonly TilePos[],
        placerId: number
    ): boolean {
        return this.attachTarget(spike, occupied, placerId) !== undefined;
    }

    private attachTarget(
        spike: BuildingConfig,
        occupied: readonly TilePos[],
        placerId: number
    ): GameObject | undefined {
        if (!spike.material || !this.inWorld(occupied)) return undefined;
        const target = this.uniformOccupant(occupied);
        if (!target) return undefined;
        const tile = TileEntity.get(target);
        if (!tile || tile.ownerId !== placerId) return undefined;
        if (Spiked.get(target)) return undefined;
        const existing = BuildingConfigs.get(Type.get(target)?.id);
        if (
            (existing.class !== "wall" && existing.class !== "door") ||
            existing.material !== spike.material
        ) {
            return undefined;
        }
        return target;
    }

    private tryUpgradeStructure(
        structureId: number,
        next: BuildingConfig,
        occupant: GameObject,
        placerId?: number
    ): boolean {
        if (placerId === undefined) return false;
        if (!this.canUpgradeStructure(next, occupant, placerId)) return false;

        const oldTile = occupant.get(TileEntity);
        const origin = { ...oldTile.origin };
        const rot = oldTile.rot;

        this.trigger(GameEvent.DeleteObject, { object: occupant });
        this.world.removeObject(occupant);

        const tile = makeTileEntity(
            origin,
            rot,
            next.placement.blocked,
            occupancyLayerForClass(next.class)
        );
        tile.ownerId = placerId;
        this.world.addObject(
            new Structure(
                tileEntityPhysics(origin, rot),
                { id: structureId },
                tile
            )
        );
        return true;
    }

    private canUpgradeStructure(
        next: BuildingConfig,
        occupant: GameObject,
        placerId: number
    ): boolean {
        const tile = TileEntity.get(occupant);
        if (!tile || tile.ownerId !== placerId) return false;
        const current = BuildingConfigs.get(Type.get(occupant)?.id);
        if (current.class !== next.class) return false;
        if (!sameFootprint(current.placement.blocked, next.placement.blocked)) {
            return false;
        }
        if (
            next.tier === undefined ||
            current.tier === undefined ||
            next.tier <= current.tier
        ) {
            return false;
        }
        return (
            structureUpgradeGroup(current.material) ===
                structureUpgradeGroup(next.material) &&
            structureUpgradeGroup(next.material) !== ""
        );
    }

    /** Single shared structure-layer occupant covering every footprint tile. */
    private uniformOccupant(
        occupied: readonly TilePos[]
    ): GameObject | undefined {
        if (occupied.length === 0 || !this.inWorld(occupied)) return undefined;
        let found: GameObject | undefined;
        for (const { x, y } of occupied) {
            const id = this.world.context.occupancy.get(x, y, "structure");
            if (id === undefined) return undefined;
            const object = this.world.getObject(id);
            if (!object) return undefined;
            if (!found) found = object;
            else if (found.id !== object.id) return undefined;
        }
        return found;
    }

    private canPlaceEmpty(
        structureId: number,
        config: BuildingConfig,
        occupied: readonly TilePos[]
    ): boolean {
        const layer = occupancyLayerForClass(config.class);
        if (
            occupied.length === 0 ||
            !this.inWorld(occupied) ||
            !this.world.context.occupancy.canPlace(occupied, layer) ||
            !this.hasGround(occupied, config.placement.ground) ||
            !stackAllowedForBuilding(
                this.world,
                occupied,
                config,
                structureId
            )
        ) {
            return false;
        }

        // Non-solid layers (floors/roofs) may share a tile with movers.
        if (!config.solid) return true;

        const circle = new Circle(new Vector(), FOOTPRINT_CIRCLE_RADIUS);
        // Freecam ghosts carry Physics for pose only — never block map edits.
        const dynamic = this.world
            .query([Physics])
            .filter(
                (object) =>
                    !TileEntity.get(object) && !FreecamGhostData.get(object)
            );
        for (const { x, y } of occupied) {
            circle.pos.x = tileCenterWorld(x);
            circle.pos.y = tileCenterWorld(y);
            for (const object of dynamic) {
                const physics = object.get(Physics);
                if (testCircleCircle(circle, physics.collider)) {
                    return false;
                }
            }
        }
        return true;
    }

    private inWorld(occupied: readonly TilePos[]): boolean {
        return !occupied.some(
            ({ x, y }) => x < 0 || y < 0 || x >= WORLD_TILES || y >= WORLD_TILES
        );
    }

    private hasGround(
        occupied: readonly TilePos[],
        allowedTypes: readonly number[]
    ): boolean {
        return occupied.every(({ x, y }) => {
            const top = topGroundAt(this.world, x, y);
            return top !== undefined && allowedTypes.includes(top.type);
        });
    }
}

function normalizeRotation(rotation: number): TileRot | undefined {
    if (!Number.isInteger(rotation)) return undefined;
    return (((rotation % 4) + 4) % 4) as TileRot;
}

function sameFootprint(
    left: readonly TilePos[],
    right: readonly TilePos[]
): boolean {
    if (left.length !== right.length) return false;
    const cells = new Set(left.map(({ x, y }) => `${x},${y}`));
    return right.every(({ x, y }) => cells.has(`${x},${y}`));
}
