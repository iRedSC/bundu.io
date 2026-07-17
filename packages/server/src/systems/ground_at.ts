import { GroundData } from "../components/base.js";
import type { World } from "../engine";

/** Topmost ground covering a tile (newest placement wins). */
export function topGroundAt(
    world: World,
    tx: number,
    ty: number
): { type: number; objectId: number } | undefined {
    const grounds = world.query([GroundData]);
    for (let i = grounds.length - 1; i >= 0; i--) {
        const ground = grounds[i];
        if (!ground?.active) continue;
        const { collider, type } = ground.get(GroundData);
        if (
            tx >= collider.pos.x &&
            ty >= collider.pos.y &&
            tx < collider.pos.x + collider.w &&
            ty < collider.pos.y + collider.h
        ) {
            return { type, objectId: ground.id };
        }
    }
    return undefined;
}
