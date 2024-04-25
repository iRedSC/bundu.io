import { Component } from "../../game_engine/component.js";

export type entityConfigData = {
    anger: number;
    speed: number;
    attack_damage: number;
    size: number;
    wander_range: number;
    rest_time: number;
};

export type EntityConfig = {
    id: number;
    anger: number;
    speed: number;
    attackDamage: number;
    size: number;
    wanderRange: number;
    restTime: number;
};
export const EntityConfig = Component.register<EntityConfig>();

export function createEntityConfig(
    id: number,
    data: Partial<entityConfigData>
) {
    const config: any = {};
    config.id = id;
    config.wanderRange = data.wander_range ?? 1000;
    config.anger = data.anger ?? 1;
    config.speed = data.speed ?? 1;
    config.attackDamage = data.attack_damage ?? 0;
    config.size = data.size ?? 2;
    config.restTime = data.rest_time ?? 1000;
    return new EntityConfig(config);
}
