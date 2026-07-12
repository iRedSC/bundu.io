import { Box, Circle, Vector } from "sat";
import { Component } from "../engine";
import type { TilePos, TileRot } from "@bundu/shared/tiles";

export type Physics = {
    position: Vector;
    collider: Circle;
    rotation: number;
    collisionRadius: number;
    speed: number;
};
export const Physics = Component.register<Physics>(() => {
    const position = new Vector();

    return {
        position,
        collider: new Circle(position, 15),
        collisionRadius: 15,
        speed: 0,
        rotation: 0,
    };
});

/** Tile-grid entity: integer origin, discrete rot, occupied world tiles. */
export type TileEntity = {
    origin: TilePos;
    rot: TileRot;
    /** Local blocked offsets (before rotation). */
    blocked: TilePos[];
    /** Cached world tiles currently claimed in the occupancy grid. */
    occupied: TilePos[];
};
export const TileEntity = Component.register<TileEntity>(() => ({
    origin: { x: 0, y: 0 },
    rot: 0,
    blocked: [{ x: 0, y: 0 }],
    occupied: [],
}));

export type CalculateCollisions = {};
export const CalculateCollisions = Component.register<CalculateCollisions>(
    () => ({})
);

export type Type = { id: number; variant?: string };
export const Type = Component.register<Type>(() => ({ id: 0 }));

export type GroundData = {
    collider: Box;
    type: number;
    speedMultiplier: number;
    createPacket: () => [
        type: number,
        x: number,
        y: number,
        w: number,
        h: number,
    ];
};
export const GroundData = Component.register<GroundData>(() => ({
    collider: new Box(new Vector(), 100, 100),
    type: 1,
    speedMultiplier: 1,
    createPacket() {
        return [
            this.type,
            this.collider.pos.x,
            this.collider.pos.y,
            this.collider.w,
            this.collider.h,
        ];
    },
}));

export type ResourceData = {
    items: Record<number, number>;
    decayAt: number | null;
    lastRegen: number;
};
export const ResourceData = Component.register<ResourceData>(() => ({
    items: {},
    decayAt: null,
    lastRegen: 0,
}));

export type Health = {
    max: number;
    value: number;
    /** Game time of last regen tick; per-entity so cadence is not shared. */
    lastRegen: number;
};

export const Health = Component.register<Health>(() => ({
    max: 100,
    value: 100,
    lastRegen: 0,
}));
