import { GameObject } from "@ioengine/server";
import type { SystemEventCallback } from "@ioengine/server";

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

    export const Block = 2;
    export type Block = {
        object: GameObject;
        stop: boolean;
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

    export const SendNewObjects = 7;
    export type SendNewObjects = {
        object: GameObject;
        objects: number[];
    };

    export const SendObjectUpdates = 8;
    export type SendObjectUpdates = {
        object: GameObject;
    };

    export const DeleteObject = 9;
    export type DeleteObject = {
        objects: GameObject;
    };

    export const SpawnItem = 10;
    export type SpawnItem = {
        id: number;
        amount: number;
        x: number;
        y: number;
    };

    export const UpdateInventory = 11;
    export type UpdateInventory = {
        object: GameObject;
    };

    export const UpdateEquipment = 12;
    export type UpdateEquipment = {
        object: GameObject;
        mainhand: number;
        offhand: number;
        helmet: number;
        backpack: boolean;
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

    export const DropItem = 17;
    export type DropItem = {
        object: GameObject;
        id: number;
        all: boolean;
    };

    export const CraftItem = 18;
    export type CraftItem = {
        object: GameObject;
        id: number;
    };

    export const SelectItem = 19;
    export type SelectItem = {
        object: GameObject;
        id: number;
    };

    export const GiveItem = 20;
    export type GiveItem = {
        object: GameObject;
        id?: number;
        amount?: number;
    };

    export const RemoveItem = 21;
    export type RemoveItem = {
        object: GameObject;
        id?: number;
        amount?: number;
    };
}

export type GameEventMap = {
    [GameEvent.Attack]: GameEvent.Attack;
    [GameEvent.Block]: GameEvent.Block;
    [GameEvent.Move]: GameEvent.Move;
    [GameEvent.Collide]: GameEvent.Collide;
    [GameEvent.Rotate]: GameEvent.Rotate;
    [GameEvent.NewObject]: GameEvent.NewObject;
    [GameEvent.SendNewObjects]: GameEvent.SendNewObjects;
    [GameEvent.SendObjectUpdates]: GameEvent.SendObjectUpdates;
    [GameEvent.DeleteObject]: GameEvent.DeleteObject;
    [GameEvent.SpawnItem]: GameEvent.SpawnItem;
    [GameEvent.UpdateInventory]: GameEvent.UpdateInventory;
    [GameEvent.UpdateEquipment]: GameEvent.UpdateEquipment;
    [GameEvent.Hurt]: GameEvent.Hurt;
    [GameEvent.Kill]: GameEvent.Kill;
    [GameEvent.ChatMessage]: GameEvent.ChatMessage;
    [GameEvent.HealthUpdate]: GameEvent.HealthUpdate;
    [GameEvent.DropItem]: GameEvent.DropItem;
    [GameEvent.CraftItem]: GameEvent.CraftItem;
    [GameEvent.SelectItem]: GameEvent.SelectItem;
    [GameEvent.GiveItem]: GameEvent.GiveItem;
    [GameEvent.RemoveItem]: GameEvent.RemoveItem;
};

export type GameEventCallback<T extends keyof GameEventMap> =
    SystemEventCallback<GameEventMap, T>;
