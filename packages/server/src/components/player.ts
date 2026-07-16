import { Component } from "../engine";

export type CraftingState = {
    itemId: number;
    endsAt: number;
};

export type EatingState = {
    itemId: number;
    endsAt: number;
};

export type PlayerData = {
    name: string;
    score: number;
    /** Stable browser-session identity used for dev checkpoint reattachment. */
    sessionId?: string;

    playerSkin: string;
    selectedStructure: {
        id: number;
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
};
export const PlayerData = Component.register<PlayerData>(() => ({
    name: "unnamed",
    score: 0,
    playerSkin: "base",
    moveDir: [0, 0],
    selectedStructure: {
        id: -1,
        rotation: 0,
        cursor: { x: 0, y: 0 },
    },
}));
