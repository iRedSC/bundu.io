import { Box, Circle, Vector } from "sat";
import { Component } from "../engine";

export type Physics = {
    position: Vector;
    collider: Circle;
    rotation: number;
    collisionRadius: number;
    solid: boolean;
    speed: number;
};
export const Physics = Component.register<Physics>(() => {
    const position = new Vector();

    return {
        position,
        collider: new Circle(position, 15),
        collisionRadius: 15,
        solid: false,
        speed: 0,
        rotation: 0,
    };
});

export type CalculateCollisions = {};
export const CalculateCollisions = Component.register<CalculateCollisions>(
    () => ({})
);

export type Type = { id: number; variant?: number };
export const Type = Component.register<Type>(() => ({ id: 0 }));

export type EntityAI = {
    target: Vector;
    arriveTime: number;
    travelTime: number;
    lastPosition: Vector;
    lastMoveTime: number;
};
export const EntityAI = Component.register<EntityAI>(() => ({
    target: new Vector(),
    arriveTime: 0,
    travelTime: 0,
    lastPosition: new Vector(),
    lastMoveTime: 0,
}));

export type GroundData = {
    collider: Box;
    type: number;
    speedMultiplier: number;
    createPacket: () => [
        type: number,
        x: number,
        y: number,
        w: number,
        h: number
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

export type Flags = Set<number>;
export const Flags = Component.register<Flags>(() => new Set<number>());

export type GroundItemData = {
    id: number;
    amount: number;
    despawnTime: number;
};
export const GroundItemData = Component.register<GroundItemData>(() => ({
    id: 0,
    amount: 0,
    despawnTime: 0,
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
};

export const Health = Component.register<Health>(() => ({
    max: 100,
    value: 100,
}));
