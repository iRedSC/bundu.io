import type { GameObject } from "../engine";
import { TileEntity } from "../components/base.js";

/**
 * Whether `other` should be spared by structure contact / reflect damage.
 * Currently owner-only; leave room for teams and pets later.
 */
export function isStructureFriendlyTo(
    structure: GameObject,
    other: GameObject
): boolean {
    const ownerId = TileEntity.get(structure)?.ownerId;
    if (ownerId === undefined) return false;
    if (other.id === ownerId) return true;
    return false;
}

/**
 * Whether `other` is friendly to `player` (same team / party, etc.).
 * Self is friendly; everyone else is hostile until teams exist.
 */
export function isPlayerFriendlyTo(
    player: GameObject,
    other: GameObject
): boolean {
    return player.id === other.id;
}
