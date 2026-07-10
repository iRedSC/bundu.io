import type { GameObjectData } from "./object_types.js";

export namespace ServerPacket {
    export const SetRotation = 0x00;
    export type SetRotation = { id: number; rotation: number };

    export const SetPosition = 0x01;
    export type SetPosition = { id: number; x: number; y: number };

    export const LoadObject = 0x04;
    export type LoadObject = {
        [T in keyof GameObjectData.ByType]: {
            id: number;
            x: number;
            y: number;
            rotation: number;
            type: T;
            data: GameObjectData.ByType[T];
        };
    }[keyof GameObjectData.ByType];

    export const UpdateVitals = 0x06;
    export type UpdateVitals = {
        health: number;
        hunger: number;
        heat: number;
    };

    export const UpdateInventory = 0x07;
    export type UpdateInventory = {
        items: ([itemId: number, count: number] | null)[];
    };

    export const UpdateEquipment = 0x08;
    export type UpdateEquipment = {
        id: number;
        mainhand: number;
        offhand: number;
        helmet: number;
        backpack: boolean;
    };

    export const DeleteObjects = 0x09;
    export type DeleteObjects = { objects: number[] };

    export const Ping = 0x0a;
    export type Ping = {};

    export const DebugDrawPolygon = 0x0b;
    export type DebugDrawPolygon = {
        startX: number;
        startY: number;
        points: [x: number, y: number][];
    };

    export const ChatMessage = 0x0c;
    export type ChatMessage = { id: number; message: string };

    export const LoadGround = 0x0d;
    export type LoadGround = {
        groundData: [
            type: number,
            x: number,
            y: number,
            w: number,
            h: number
        ][];
    };

    export const ClientConnectionInfo = 0x0e;
    export type ClientConnectionInfo = {
        playerId: number;
        serverStartTime: number;
    };

    export const RecipeList = 0x0f;
    export type RecipeList = {
        recipes: [
            itemId: number,
            requirements: [requiredItemId: number, amount: number][],
            flags: number[]
        ][];
    };

    export const SetSelectedStructure = 0x10;
    export type SetSelectedStructure = {
        structureId: number;
        structureSize: number;
    };

    export const AttackEvent = 0x11;
    export type AttackEvent = { id: number };

    export const BlockEvent = 0x12;
    export type BlockEvent = { id: number; stop: boolean };

    export const HitEvent = 0x13;
    export type HitEvent = { id: number; angle: number };

    export const DebugDrawRects = 0x14;
    export type DebugDrawRects = {
        rects: [x: number, y: number, w: number, h: number][];
    };
}

export namespace ClientPacket {
    export const Rotation = 0x00;
    export type Rotation = { rotation: number };

    export const Movement = 0x01;
    export type Movement = { direction: number };

    export const Attack = 0x04;
    export type Attack = { stop: boolean };

    export const SelectItem = 0x05;
    export type SelectItem = { itemId: number };

    export const Ping = 0x06;
    export type Ping = {};

    export const CraftItem = 0x07;
    export type CraftItem = { itemId: number };

    export const ChatMessage = 0x08;
    export type ChatMessage = { message: string };

    export const DropItem = 0x09;
    export type DropItem = { itemId: number; dropAll: boolean };

    export const Block = 0x0c;
    export type Block = { stop: boolean };
}

/** Field order for msgpack serialization. No runtime validators. */
export namespace Schema {
    export const Server = {
        [ServerPacket.SetRotation]: { fields: ["id", "rotation"] as const },
        [ServerPacket.SetPosition]: { fields: ["id", "x", "y"] as const },
        [ServerPacket.LoadObject]: {
            fields: ["id", "type", "x", "y", "rotation", "data"] as const,
        },
        [ServerPacket.UpdateVitals]: {
            fields: ["health", "hunger", "heat"] as const,
        },
        [ServerPacket.UpdateInventory]: { fields: ["items"] as const },
        [ServerPacket.UpdateEquipment]: {
            fields: ["id", "mainhand", "offhand", "helmet", "backpack"] as const,
        },
        [ServerPacket.DeleteObjects]: { fields: ["objects"] as const },
        [ServerPacket.Ping]: { fields: [] as const },
        [ServerPacket.DebugDrawPolygon]: {
            fields: ["startX", "startY", "points"] as const,
        },
        [ServerPacket.ChatMessage]: { fields: ["id", "message"] as const },
        [ServerPacket.LoadGround]: { fields: ["groundData"] as const },
        [ServerPacket.ClientConnectionInfo]: {
            fields: ["playerId", "serverStartTime"] as const,
        },
        [ServerPacket.RecipeList]: { fields: ["recipes"] as const },
        [ServerPacket.SetSelectedStructure]: {
            fields: ["structureId", "structureSize"] as const,
        },
        [ServerPacket.AttackEvent]: { fields: ["id"] as const },
        [ServerPacket.BlockEvent]: { fields: ["id", "stop"] as const },
        [ServerPacket.HitEvent]: { fields: ["id", "angle"] as const },
        [ServerPacket.DebugDrawRects]: { fields: ["rects"] as const },
    } as const;

    export const Client = {
        [ClientPacket.Rotation]: { fields: ["rotation"] as const },
        [ClientPacket.Movement]: { fields: ["direction"] as const },
        [ClientPacket.Attack]: { fields: ["stop"] as const },
        [ClientPacket.Block]: { fields: ["stop"] as const },
        [ClientPacket.SelectItem]: { fields: ["itemId"] as const },
        [ClientPacket.Ping]: { fields: [] as const },
        [ClientPacket.CraftItem]: { fields: ["itemId"] as const },
        [ClientPacket.ChatMessage]: { fields: ["message"] as const },
        [ClientPacket.DropItem]: { fields: ["itemId", "dropAll"] as const },
    } as const;
}

export type ServerPacketMap = {
    [ServerPacket.SetRotation]: ServerPacket.SetRotation;
    [ServerPacket.SetPosition]: ServerPacket.SetPosition;
    [ServerPacket.LoadObject]: ServerPacket.LoadObject;
    [ServerPacket.UpdateVitals]: ServerPacket.UpdateVitals;
    [ServerPacket.UpdateInventory]: ServerPacket.UpdateInventory;
    [ServerPacket.UpdateEquipment]: ServerPacket.UpdateEquipment;
    [ServerPacket.DeleteObjects]: ServerPacket.DeleteObjects;
    [ServerPacket.Ping]: ServerPacket.Ping;
    [ServerPacket.DebugDrawPolygon]: ServerPacket.DebugDrawPolygon;
    [ServerPacket.ChatMessage]: ServerPacket.ChatMessage;
    [ServerPacket.LoadGround]: ServerPacket.LoadGround;
    [ServerPacket.ClientConnectionInfo]: ServerPacket.ClientConnectionInfo;
    [ServerPacket.RecipeList]: ServerPacket.RecipeList;
    [ServerPacket.SetSelectedStructure]: ServerPacket.SetSelectedStructure;
    [ServerPacket.AttackEvent]: ServerPacket.AttackEvent;
    [ServerPacket.BlockEvent]: ServerPacket.BlockEvent;
    [ServerPacket.HitEvent]: ServerPacket.HitEvent;
    [ServerPacket.DebugDrawRects]: ServerPacket.DebugDrawRects;
};

export type ClientPacketMap = {
    [ClientPacket.Rotation]: ClientPacket.Rotation;
    [ClientPacket.Movement]: ClientPacket.Movement;
    [ClientPacket.Attack]: ClientPacket.Attack;
    [ClientPacket.Block]: ClientPacket.Block;
    [ClientPacket.SelectItem]: ClientPacket.SelectItem;
    [ClientPacket.Ping]: ClientPacket.Ping;
    [ClientPacket.CraftItem]: ClientPacket.CraftItem;
    [ClientPacket.ChatMessage]: ClientPacket.ChatMessage;
    [ClientPacket.DropItem]: ClientPacket.DropItem;
};

export type ServerPacketID = keyof ServerPacketMap;
export type ClientPacketID = keyof ClientPacketMap;
