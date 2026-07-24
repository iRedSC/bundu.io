import { canUseCapability } from "../auth/capabilities.js";
import type { GameObject } from "../engine";

/** Freecam editor actions require the centralized admin capability. */
export function canUseEditor(player: GameObject): boolean {
    return canUseCapability(player, "admin");
}
