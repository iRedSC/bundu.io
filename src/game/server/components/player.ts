import { Component, VisibleObjects } from "@ioengine/server";

export type PlayerData = {
    name: string;
    score: number;
    visibleObjects: VisibleObjects;

    playerSkin: number;
    selectedStructure: {
        id: number;
        cooldown_timestamp: number;
    };

    mainHand?: number;
    offHand?: number;
    helmet?: number;
    backpack?: boolean;

    moveDir: [number, number];
    attacking?: boolean;
    blocking?: boolean;
    lastAttackTime?: number;
};
export const PlayerData = Component.register<PlayerData>(() => ({
    name: "unnamed",
    score: 0,
    visibleObjects: new VisibleObjects(),
    playerSkin: 0,
    backpackSkin: 0,
    moveDir: [0, 0],
    selectedStructure: {
        id: -1,
        cooldown_timestamp: 0,
    },
}));
