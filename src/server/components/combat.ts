import { Component } from "../game_engine/component.js";

export type Health = { max: number; value: number };
export const Health = Component.register<Health>(() => ({
    max: 200,
    value: 200,
}));
