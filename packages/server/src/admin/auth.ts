import { PlayerData } from "../components/player.js";
import { SERVER_DEBUG } from "../debug/flag.js";
import type { GameObject } from "../engine";

/** Freecam editor actions require freecam + cheats (or debug builds). */
export function canUseEditor(player: GameObject): boolean {
    const data = PlayerData.get(player);
    if (!data?.freecam) return false;
    return data.cheatsEnabled === true || SERVER_DEBUG;
}
