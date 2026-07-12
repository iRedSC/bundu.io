import { Component } from "../engine";

export type CraftingState = {
    itemId: number;
    endsAt: number;
};

export type PlayerData = {
    name: string;
    score: number;

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
};
export const PlayerData = Component.register<PlayerData>(() => ({
    name: "unnamed",
    score: 0,
    playerSkin: "base",
    backpackSkin: 0,
    moveDir: [0, 0],
    selectedStructure: {
        id: -1,
        rotation: 0,
        cursor: { x: 0, y: 0 },
    },
}));
