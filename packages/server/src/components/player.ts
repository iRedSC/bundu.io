import { Component } from "../engine";
import type { AttributesData } from "./attributes";

export type CraftingState = {
    recipeId: number;
    endsAt: number;
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
    crafting?: CraftingState;
    eating?: EatingState;
    cheatsEnabled?: boolean;
    /** Soft-despawned spectator/editor camera; sim paused, hidden from peers. */
    freecam?: boolean;
    /** Last client screenspace AOI while freecam is active. */
    freecamView?: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        overview: boolean;
    };
};
export const PlayerData = Component.register<PlayerData>(() => ({
    name: "unnamed",
    score: 0,
    playerSkin: "base",
    moveDir: [0, 0],
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
