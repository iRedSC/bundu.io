import { GameObject } from "../engine";
import type { SystemEventCallback } from "../engine";

/**
 * Events that actually have listeners.
 * Outbound packets are emitted by the owning system (not a PacketSystem bridge).
 */
export namespace GameEvent {
    export const Attack = 1;
    export type Attack = {
        object: GameObject;
        damage?: number;
        weapon?: number;
        hitbox?: {
            start: number;
            length: number;
            width: number;
        };
    };

    export const Move = 3;
    export type Move = {
        object: GameObject;
        x: number;
        y: number;
    };

    export const Collide = 4;
    export type Collide = {
        object: GameObject;
    };

    export const Rotate = 5;
    export type Rotate = {
        object: GameObject;
        rotation: number;
    };

    export const NewObject = 6;
    export type NewObject = {
        object: GameObject;
    };

    export const DeleteObject = 9;
    export type DeleteObject = {
        object: GameObject;
    };

    export const Hurt = 13;
    export type Hurt = {
        object: GameObject;
        source?: GameObject;
        damage?: number;
        weapon?: number;
    };

    export const Kill = 14;
    export type Kill = {
        object: GameObject;
        source?: GameObject;
    };

    export const PlaceStructure = 24;
    export type PlaceStructure = {
        structureId: number;
        x: number;
        y: number;
        rotation: number;
    };
}

export type GameEventMap = {
    [GameEvent.Attack]: GameEvent.Attack;
    [GameEvent.Move]: GameEvent.Move;
    [GameEvent.Collide]: GameEvent.Collide;
    [GameEvent.Rotate]: GameEvent.Rotate;
    [GameEvent.NewObject]: GameEvent.NewObject;
    [GameEvent.DeleteObject]: GameEvent.DeleteObject;
    [GameEvent.Hurt]: GameEvent.Hurt;
    [GameEvent.Kill]: GameEvent.Kill;
    [GameEvent.PlaceStructure]: GameEvent.PlaceStructure;
};

export type GameEventCallback<T extends keyof GameEventMap> =
    SystemEventCallback<GameEventMap, T>;
