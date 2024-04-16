import { GameObject } from "../game_engine/game_object";

export type HurtEvent = {
    source: GameObject;
    damage: number;
};

export type SpawnItemEvent = {
    id: number;
    amount: number;
};

export type DropItemEvent = {
    id: number;
    all: boolean;
};

export interface TriggerMethod {
    (event: string, objectIds: number | Set<number> | undefined, data: unknown);
    (event: "move", objectIds: number | Set<number> | undefined): void;
    (event: "collide", objectIds: number | Set<number> | undefined): void;
    (event: "attack", objectIds: number | Set<number> | undefined): void;
    (
        event: "block",
        objectIds: number | Set<number> | undefined,
        stop: boolean
    ): void;
    (
        event: "send_new_objects",
        objectIds: number | Set<number> | undefined,
        objects: number[]
    ): void;
    (
        event: "send_object_updates",
        objectIds: number | Set<number> | undefined
    ): void;
    (
        event: "update_inventory",
        objectIds: number | Set<number> | undefined
    ): void;
    (event: "rotate", objectIds: number | Set<number> | undefined): void;
    (
        event: "update_gear",
        objectIds: number | Set<number> | undefined,
        items: [number, number, number, number]
    ): void;
    (
        event: "hurt",
        objectIds: number | Set<number> | undefined,
        data: HurtEvent
    ): void;
    (
        event: "chat_message",
        objectIds: number | Set<number> | undefined,
        message: string
    ): void;
    (event: "update_health", objectIds: number | Set<number> | undefined): void;
}
