import { Component } from "../engine";
import type { AttributesData } from "./attributes";

export type CraftingState = {
    recipeId: number;
    endsAt: number;
    /** Scaled ingredient costs frozen when the craft channel starts. */
    ingredients: Map<number, number>;
};

export type EatingState = {
    itemId: number;
    endsAt: number;
};

export type PlayerData = {
    name: string;
    score: number;
    /**
     * Unguessable reclaim token. Survives soft-disconnect; cleared on death.
     * Client stores it (sessionStorage) and sends it on reconnect.
     */
    sessionId?: string;
    /** GameTime when the last socket detached; undefined while connected. */
    parkedAt?: number;

    playerSkin: string;
    selectedStructure: {
        id: number;
        itemId: number;
        rotation: number;
        cursor: { x: number; y: number };
    };

    mainHand?: number;
    offHand?: number;
    helmet?: number;
    backpack?: boolean;

    moveDir: [number, number];
    attacking?: boolean;
    blocking?: boolean;
    lastAttackTime?: number;
    /** GameTime of last Interact (door toggle cooloff). */
    lastInteractTime?: number;
    crafting?: CraftingState;
    eating?: EatingState;
    /**
     * Operator level. `0` = no commands. Cheat phrase sets `4`.
     * Accounts will own this later.
     */
    opLevel: number;
    /** @deprecated Prefer `opLevel`; kept for freecam editor gate compat. */
    cheatsEnabled?: boolean;
    /** Soft-despawned spectator/editor camera; sim paused, hidden from peers. */
    freecam?: boolean;
    /**
     * Creative mode: item give palette + cheat toolbar while still playing.
     * Independent of freecam (chrome hides under freecam UI).
     */
    creative?: boolean;
    /**
     * Godmode: vitals frozen and damage ignored.
     * Toggled by `/godmode` or the creative toolbar.
     */
    godmode?: boolean;
    /** Creative movement speed multiplier (0.5 | 1 | 2 | 4). */
    creativeSpeed?: number;
    /** Creative instakill: large attack.damage add. */
    creativeInstakill?: boolean;
    /** Last client screenspace AOI while freecam is active. */
    freecamView?: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        overview: boolean;
    };
    /**
     * Roof connectivity group the player currently occupies, if any.
     * Same non-undefined group → peers see the real player under occlusion.
     */
    underRoofGroupId?: number;
    /**
     * True until the client's first ClientReady after create — hidden from peers
     * and not in the spatial index until then.
     */
    pendingSpawn?: boolean;
    /** Cleared on connect; set by ClientReady before loadView / gameplay. */
    clientReady?: boolean;
};
export const PlayerData = Component.register<PlayerData>(() => ({
    name: "unnamed",
    score: 0,
    playerSkin: "base",
    moveDir: [0, 0],
    opLevel: 0,
    selectedStructure: {
        id: -1,
        itemId: -1,
        rotation: 0,
        cursor: { x: 0, y: 0 },
    },
}));

/** Ephemeral intent / channels — never durable across disconnect or checkpoint. */
export function clearEphemeralPlayerIntent(data: PlayerData): void {
    data.moveDir = [0, 0];
    data.attacking = false;
    data.blocking = false;
    data.crafting = undefined;
    data.eating = undefined;
}

/**
 * Attribute sources for block/eat channels (no duration).
 * Clear with intent so restore/park cannot leave modifiers without flags.
 */
export function clearEphemeralPlayerAttributeSources(
    attributes: AttributesData
): void {
    attributes.clear("blocking");
    attributes.clear("eating");
}
