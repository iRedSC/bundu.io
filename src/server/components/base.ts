import { Component } from "../game_engine/component.js";

export type Health = { value: number };
export const Health = Component.register<Health>();

export type Damage = { value: number };
export const Damage = Component.register<Damage>();

export type Physics = {
    position: SAT.Vector;
    collider: SAT.Circle;
    rotation: number;
    size: number;
    solid: boolean;
};
export const Physics = Component.register<Physics>();

export type CalculateCollisions = {};
export const CalculateCollisions = Component.register<CalculateCollisions>();

export type Type = { id: number; variant?: number };
export const Type = Component.register<Type>();

export type EntityAI = {
    target: SAT.Vector;
    arriveTime: number;
    travelTime: number;
    lastPosition: SAT.Vector;
    lastMoveTime: number;
};
export const EntityAI = Component.register<EntityAI>();
