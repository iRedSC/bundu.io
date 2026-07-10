import {
    FOOTPRINT_CIRCLE_RADIUS,
    SINGLE_TILE,
    tileCenterWorld,
    tileRotToDegrees,
    worldFootprint,
    worldToDeci,
    type TilePos,
    type TileRot,
} from "@bundu/shared/tiles";
import { Circle, Vector } from "sat";
import type { Physics, TileEntity } from "../components/base.js";

/** Physics at the origin tile center; solidity lives in the occupancy grid. */
export function tileEntityPhysics(origin: TilePos, rot: TileRot): Physics {
    const position = new Vector(
        tileCenterWorld(origin.x),
        tileCenterWorld(origin.y)
    );
    return {
        position,
        collider: new Circle(position, FOOTPRINT_CIRCLE_RADIUS),
        collisionRadius: FOOTPRINT_CIRCLE_RADIUS,
        rotation: tileRotToDegrees(rot),
        speed: 0,
    };
}

export function makeTileEntity(
    origin: TilePos,
    rot: TileRot = 0,
    blocked: readonly TilePos[] = SINGLE_TILE
): TileEntity {
    return {
        origin: { ...origin },
        rot,
        blocked: blocked.map((c) => ({ ...c })),
        occupied: worldFootprint(origin, blocked, rot),
    };
}

/** Packet position fields: integer decitiles. */
export function deciPacketPos(physics: Physics): { x: number; y: number } {
    return {
        x: worldToDeci(physics.position.x),
        y: worldToDeci(physics.position.y),
    };
}
