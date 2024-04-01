import { Component } from "../game_engine/component";

export type Health = { value: number };
export const Health = Component.register<Health>();

export type Damage = { value: number };
export const Damage = Component.register<Damage>();

export type Physics = {
    position: SAT.Vector;
    collider: SAT.Circle;
    rotation: number;
    size: number;
};
export const Physics = Component.register<Physics>();

export type Type = { id: number; variant?: number };
export const Type = Component.register<Type>();
