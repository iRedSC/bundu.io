import {
    DEFAULT_INTERACTION_REACH,
    hasClearTileLine,
    pointToTile,
    TILE_SIZE,
    worldFootprint,
    worldToTile,
    type TilePos,
    type TileRot,
} from "@bundu/shared";
import { AdminPlaceKind } from "@bundu/shared/packet_definitions";
import { clientStructurePlacement } from "../configs/registries";
import type GameObject from "./game_object";
import { Animal } from "./objects/animal";
import { Player } from "./objects/player";
import { Structure } from "./objects/structure";

export type InteractHover = {
    structure: Structure;
    canInteract: boolean;
};

function tileRotFromDegrees(degrees: number): TileRot {
    const quarter = Math.round(degrees / 90);
    return (((quarter % 4) + 4) % 4) as TileRot;
}

function structureOccupied(structure: Structure): TilePos[] {
    if (structure.typeId < 0) {
        return [pointToTile(structure.position)];
    }
    try {
        const def = clientStructurePlacement(structure.typeId);
        const origin = {
            x: worldToTile(structure.position.x),
            y: worldToTile(structure.position.y),
        };
        // Client GameObject.rotation is radians; server tile rot is 90° steps.
        const rot = tileRotFromDegrees((structure.rotation * 180) / Math.PI);
        return worldFootprint(origin, def.blocked, rot);
    } catch {
        return [pointToTile(structure.position)];
    }
}

function solidOwnerAt(
    objects: Iterable<GameObject>,
    tile: TilePos,
    skipId: number
): number | undefined {
    for (const object of objects) {
        if (!(object instanceof Structure)) continue;
        if (object.id === skipId) continue;
        if (object.placeKind !== AdminPlaceKind.Structure) continue;
        if (object.typeId < 0) continue;
        // Open doors release server occupancy — match that for preview LOS.
        if (object.getState("open") === true) continue;
        let solid = true;
        try {
            solid = clientStructurePlacement(object.typeId).solid;
        } catch {
            solid = true;
        }
        if (!solid) continue;
        for (const cell of structureOccupied(object)) {
            if (cell.x === tile.x && cell.y === tile.y) {
                return object.ownerIdValue;
            }
        }
    }
    return undefined;
}

/** Client preview of interaction reach + owned clear line. */
export function canInteractWith(
    actor: GameObject,
    target: Structure,
    objects: Iterable<GameObject>,
    reach = DEFAULT_INTERACTION_REACH
): boolean {
    const distance = Math.hypot(
        target.position.x - actor.position.x,
        target.position.y - actor.position.y
    );
    if (distance > reach) return false;

    const dynamics: { id: number; x: number; y: number; r: number }[] = [];
    for (const object of objects) {
        if (object instanceof Player || object instanceof Animal) {
            dynamics.push({
                id: object.id,
                x: object.position.x,
                y: object.position.y,
                r: object.collisionRadius,
            });
        }
    }

    const to = pointToTile(target.position);
    return hasClearTileLine(actor.position, to, {
        actorId: actor.id,
        dynamics,
        isIntermediateBlocked: (tile) => {
            const ownerId = solidOwnerAt(objects, tile, target.id);
            if (ownerId === undefined) return false;
            return ownerId !== actor.id;
        },
    });
}

/** Nearest interactable structure under the world cursor. */
export function pickInteractHover(
    cursor: { x: number; y: number } | undefined,
    objects: Iterable<GameObject>,
    localPlayer: GameObject | undefined
): InteractHover | null {
    if (!cursor || !localPlayer) return null;

    let best: Structure | undefined;
    let bestDist = Infinity;
    for (const object of objects) {
        if (!(object instanceof Structure) || !object.isInteractable) continue;
        const dist = Math.hypot(
            cursor.x - object.position.x,
            cursor.y - object.position.y
        );
        const radius = Math.max(object.collisionRadius, TILE_SIZE / 2);
        if (dist > radius || dist >= bestDist) continue;
        best = object;
        bestDist = dist;
    }
    if (!best) return null;
    return {
        structure: best,
        canInteract: canInteractWith(localPlayer, best, objects),
    };
}
