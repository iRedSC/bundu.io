import { Component } from "../game_engine/component.js";

export type Physics = {
    position: SAT.Vector;
    collider: SAT.Circle;
    rotation: number;
    size: number;
    solid: boolean;
    speed: number;
};
export const Physics = Component.register<Physics>(() => {
    const position = new SAT.Vector();

    return {
        position,
        collider: new SAT.Circle(position, 15),
        size: 15,
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
    target: SAT.Vector;
    arriveTime: number;
    travelTime: number;
    lastPosition: SAT.Vector;
    lastMoveTime: number;
};
export const EntityAI = Component.register<EntityAI>(() => ({
    target: new SAT.Vector(),
    arriveTime: 0,
    travelTime: 0,
    lastPosition: new SAT.Vector(),
    lastMoveTime: 0,
}));

export type GroundData = {
    collider: SAT.Box;
    type: number;
    speedMultiplier: number;
};
export const GroundData = Component.register<GroundData>(() => ({
    collider: new SAT.Box(new SAT.Vector(), 100, 100),
    type: 1,
    speedMultiplier: 1,
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
