import { Component } from "../engine";

/** Networked freecam cursor avatar — not a living body, AOI-bypassed. */
export type FreecamGhostData = {
    ownerId: number;
    /** When true, non-freecam players receive ghost packets. Default false. */
    visibleToPlayers: boolean;
    name: string;
    playerSkin: string;
};

export const FreecamGhostData = Component.register<FreecamGhostData>(() => ({
    ownerId: 0,
    visibleToPlayers: false,
    name: "unnamed",
    playerSkin: "base",
}));
