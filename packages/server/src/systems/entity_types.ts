import { Type } from "../components/base.js";
import { PlayerData } from "../components/player.js";
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

/** Entity-type ids this subject counts as for effect targeting / selectors. */
export function subjectTypeIds(subject: GameObject): number[] {
    if (PlayerData.get(subject)) {
        const id = playerEntityTypeId();
        return id === undefined ? [] : [id];
    }
    const type = Type.get(subject);
    return type ? [type.id] : [];
}
