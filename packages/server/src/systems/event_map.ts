import { GameObject } from "../engine";
import type { SystemEventCallback } from "../engine";

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

    export const ChatMessage = 15;
    export type ChatMessage = {
        object: GameObject;
        message: string;
    };

    export const HealthUpdate = 16;
    export type HealthUpdate = {
        object: GameObject;
    };

    export const ObjectsRemovedFromView = 22;
    export type ObjectsRemovedFromView = {
        object: GameObject;
        objectsRemoved: GameObject[];
    };

    export const ObjectsAddedToView = 23;
    export type ObjectsAddedToView = {
        object: GameObject;
        objectsAdded: GameObject[];
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
    [GameEvent.ChatMessage]: GameEvent.ChatMessage;
    [GameEvent.HealthUpdate]: GameEvent.HealthUpdate;
    [GameEvent.ObjectsAddedToView]: GameEvent.ObjectsAddedToView;
    [GameEvent.ObjectsRemovedFromView]: GameEvent.ObjectsRemovedFromView;
    [GameEvent.PlaceStructure]: GameEvent.PlaceStructure;
};

export type GameEventCallback<T extends keyof GameEventMap> =
    SystemEventCallback<GameEventMap, T>;
