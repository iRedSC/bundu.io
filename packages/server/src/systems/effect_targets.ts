import { Type } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import type { TargetEffect } from "../configs/loaders/effect_context.js";
import { gameRegistries } from "../configs/registries.js";
import type { GameObject } from "../engine";

let playerTypeId: number | undefined;

/** Registry id for `bundu:player`, if present. */
export function playerEntityTypeId(): number | undefined {
    if (playerTypeId !== undefined) return playerTypeId;
    try {
        playerTypeId = gameRegistries().entity_type.resolve(
            "player",
            "bundu",
            "effect_targets.player"
        );
        return playerTypeId;
    } catch {
        return undefined;
    }
}

/** Entity-type ids this subject counts as for effect targeting. */
export function subjectTypeIds(subject: GameObject): number[] {
    if (PlayerData.get(subject)) {
        const id = playerEntityTypeId();
        return id === undefined ? [] : [id];
    }
    const type = Type.get(subject);
    return type ? [type.id] : [];
}

export function subjectMatchesTarget(
    subject: GameObject,
    target: TargetEffect
): boolean {
    if (target.all) return true;
    const ids = subjectTypeIds(subject);
    if (ids.length === 0) return false;
    for (const id of ids) {
        if (target.types.has(id as never)) return true;
    }
    return false;
}
