import { Component } from "../engine";

/** Lightweight stand-in for a player scrubbed by occlusionHide. */
export type AnonProxy = {
    sourceId: number;
    name: string;
    mainHand?: number;
    offHand?: number;
    helmet?: number;
    backpack: boolean;
    /** Variant id, or null when skin is hidden. */
    skinVariant: number | null;
    collisionRadius: number;
    scale: number;
};

export const AnonProxy = Component.register<AnonProxy>(() => ({
    sourceId: 0,
    name: "",
    backpack: false,
    skinVariant: null,
    collisionRadius: 15,
    scale: 1,
}));
