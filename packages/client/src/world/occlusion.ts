import { TILE_SIZE } from "@bundu/shared/tiles";
import { tileEntityDefs } from "../models/defs";
import type GameObject from "./game_object";
import { Structure } from "./objects/structure";

/** Toggle authored occlusion states for structures under the local player. */
export function updateOcclusion(
    player: GameObject | undefined,
    objects: Iterable<GameObject>
): void {
    const px = player?.position.x;
    const py = player?.position.y;

    for (const object of objects) {
        if (!(object instanceof Structure)) continue;
        const occlusion = tileEntityDefs.get(object.type)?.occlusion;
        if (!occlusion) continue;

        const under =
            px !== undefined &&
            py !== undefined &&
            Math.hypot(px - object.position.x, py - object.position.y) <=
                occlusion.radius * TILE_SIZE;
        object.setState(occlusion.state, under);
    }
}
