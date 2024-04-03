import { Component } from "../game_engine/component.js";

export type Health = { value: number };
export const Health = Component.register<Health>();

export type AttackData = {
    damage: number;
    speed: number;
    reach?: number;
};
export const AttackData = Component.register<AttackData>();
