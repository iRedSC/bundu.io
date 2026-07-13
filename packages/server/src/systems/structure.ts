import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    FOOTPRINT_CIRCLE_RADIUS,
    TILE_SIZE,
    WORLD_TILES,
    footprintCenter,
    structureOriginAtPoint,
    structurePlacementDef,
    tileCenterWorld,
    type TilePos,
    type TileRot,
} from "@bundu/shared";
import { Circle, testCircleCircle, Vector } from "sat";
import { GroundData, Health, Physics, TileEntity } from "../components/base.js";
import { Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { Attributes } from "../components/attributes.js";
import { System, type GameObject, type World } from "../engine";
import { Structure } from "../game_objects/structure.js";
import {
    makeTileEntity,
    tileEntityPhysics,
} from "../game_objects/tile_entity.js";
import { emitInventory } from "../network/inventory.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

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
        const structureId = data.selectedStructure.id;
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

        if (!inv.slots[inv.selected] || inv.slots[inv.selected]?.id !== structureId) {
            data.selectedStructure.id = -1;
            this.world.context.playerPacketManager.set(
                player.id,
                ServerPacket.SetSelectedStructure,
                { structureId: -1 }
            );
        }

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
        const { id, rotation, cursor } = data.selectedStructure;
        const rot = normalizeRotation(rotation);
        if (
            id === -1 ||
            selected?.id !== id ||
            rot === undefined
        ) {
            return undefined;
        }

        const def = structurePlacementDef(id);
        const reach = Math.max(0, player.get(Attributes).get("placement.reach"));
        const origin = structureOriginAtPoint(cursor, def.blocked, rot);
        const tile = makeTileEntity(origin, rot, def.blocked);
        const center = footprintCenter(def.blocked, rot);
        const inReach =
            Math.hypot(
                tileCenterWorld(origin.x) + center.x * TILE_SIZE - physics.position.x,
                tileCenterWorld(origin.y) + center.y * TILE_SIZE - physics.position.y
            ) <= reach;
        return {
            origin,
            rotation: rot,
            allowed: inReach && this.canPlace(tile.occupied, def.ground),
        };
    }

    /** @returns true if the structure was added to the world. */
    placeStructure({
        structureId,
        x,
        y,
        rotation,
        resultTo,
        placedBy,
    }: GameEvent.PlaceStructure): boolean {
        const allowed = this.tryPlaceStructure(
            structureId,
            x,
            y,
            rotation,
            placedBy?.id
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
        ownerId?: number
    ): boolean {
        if (!Number.isInteger(x) || !Number.isInteger(y)) return false;

        const rot = normalizeRotation(rotation);
        if (rot === undefined) return false;
        const origin = { x, y };
        const def = structurePlacementDef(structureId);
        const tile = makeTileEntity(origin, rot, def.blocked);
        tile.ownerId = ownerId;

        if (!this.canPlace(tile.occupied, def.ground)) return false;

        this.world.addObject(
            new Structure(
                tileEntityPhysics(origin, rot),
                { id: structureId, variant: "base" },
                tile
            )
        );
        return true;
    }

    private canPlace(
        occupied: readonly TilePos[],
        allowedGround: readonly number[]
    ): boolean {
        if (
            occupied.length === 0 ||
            occupied.some(
                ({ x, y }) => x < 0 || y < 0 || x >= WORLD_TILES || y >= WORLD_TILES
            ) ||
            !this.world.context.occupancy.canPlace(occupied) ||
            !this.hasGround(occupied, allowedGround)
        ) {
            return false;
        }

        const circle = new Circle(new Vector(), FOOTPRINT_CIRCLE_RADIUS);
        const dynamic = this.world
            .query([Physics])
            .filter((object) => !TileEntity.get(object));
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

    private hasGround(
        occupied: readonly TilePos[],
        allowedTypes: readonly number[]
    ): boolean {
        const grounds = this.world.query([GroundData]);
        return occupied.every(({ x, y }) =>
            grounds.some((ground) => {
                const { collider, type } = ground.get(GroundData);
                return (
                    allowedTypes.includes(type) &&
                    x >= collider.pos.x &&
                    y >= collider.pos.y &&
                    x < collider.pos.x + collider.w &&
                    y < collider.pos.y + collider.h
                );
            })
        );
    }
}

function normalizeRotation(rotation: number): TileRot | undefined {
    if (!Number.isInteger(rotation)) return undefined;
    return (((rotation % 4) + 4) % 4) as TileRot;
}
