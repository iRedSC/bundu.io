import { WORLD_TILES } from "@bundu/shared/tiles";
import { GroundData } from "../components/base.js";
import type { GameObject, World } from "../engine";

export type TopGroundAtOptions = {
    /** Skip the full-world base floor (editor delete / overlay picks). */
    editableOnly?: boolean;
};

/**
 * Topmost ground covering a tile.
 * Stack order is entity id ascending (higher id wins) — same contract as map YAML.
 */
export function topGroundAt(
    world: World,
    tx: number,
    ty: number,
    options: TopGroundAtOptions = {}
): { type: number; objectId: number } | undefined {
    let best: GameObject | undefined;
    for (const ground of world.query([GroundData])) {
        if (!ground.active) continue;
        const { collider } = ground.get(GroundData);
        const { pos, w, h } = collider;
        if (options.editableOnly && w >= WORLD_TILES && h >= WORLD_TILES) {
            continue;
        }
        if (
            tx < pos.x ||
            ty < pos.y ||
            tx >= pos.x + w ||
            ty >= pos.y + h
        ) {
            continue;
        }
        if (!best || ground.id > best.id) {
            best = ground;
        }
    }
    if (!best) return undefined;
    return { type: best.get(GroundData).type, objectId: best.id };
}
