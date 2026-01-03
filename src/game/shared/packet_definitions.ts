import typia from "typia";

type nullish = undefined | null;

export namespace ServerPacket {
    export const SetRotation = 0x00;
    export type SetRotation = { id: number; rotation: number };

    export const SetPosition = 0x01;
    export type SetPosition = { id: number; x: number; y: number };

    export const PlacementValidity = 0x03;
    export type PlacementValidity = { valid: boolean };

    export const LoadPlayer = 0x04;
    export type LoadPlayer = {
        id: number;
        x: number;
        y: number;
        rotation: number;
        name: string;
        mainhand: number | nullish;
        offhand: number | nullish;
        helmet: number | nullish;
        playerSkin: number;
        backpack: boolean;
    };

    export const UnloadObjects = 0x05;
    export type UnloadObjects = { objects: number[] };

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
            x: number,
            y: number,
            w: number,
            h: number,
            type: number
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
    export type AttackEvent = {
        id: number;
    };

    export const BlockEvent = 0x12;
    export type BlockEvent = { id: number; stop: boolean };

    export const HitEvent = 0x13;
    export type HitEvent = { id: number; angle: number };
}

export namespace ClientPacket {
    export const Rotation = 0x00;
    export type Rotation = { rotation: number };

    export const Movement = 0x01;
    export type Movement = { direction: number };

    export const RequestObjects = 0x02;
    export type RequestObjects = { objects: number[] };

    export const RequestPlacementValidity = 0x03;
    export type RequestPlacementValidity = {
        itemId: number;
        onGrid: boolean;
    };

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

export namespace Schema {
    export const Server = {
        [ServerPacket.SetRotation]: {
            fields: ["id", "rotation"] as const,
            validator: typia.createIs<ServerPacket.SetRotation>(),
            world: true,
        },
        [ServerPacket.SetPosition]: {
            fields: ["id", "x", "y"] as const,
            validator: typia.createIs<ServerPacket.SetPosition>(),
            world: true,
        },
        [ServerPacket.PlacementValidity]: {
            fields: ["valid"] as const,
            validator: typia.createIs<ServerPacket.PlacementValidity>(),
        },
        [ServerPacket.LoadPlayer]: {
            fields: [
                "id",
                "x",
                "y",
                "rotation",
                "name",
                "mainhand",
                "offhand",
                "helmet",
                "playerSkin",
                "backpack",
            ] as const,
            validator: typia.createIs<ServerPacket.LoadPlayer>(),
            world: true,
        },
        [ServerPacket.UnloadObjects]: {
            fields: ["objects"] as const,
            validator: typia.createIs<ServerPacket.UnloadObjects>(),
        },
        [ServerPacket.UpdateVitals]: {
            fields: ["health", "hunger", "heat"] as const,
            validator: typia.createIs<ServerPacket.UpdateVitals>(),
        },
        [ServerPacket.UpdateInventory]: {
            fields: ["items"] as const,
            validator: typia.createIs<ServerPacket.UpdateInventory>(),
        },
        [ServerPacket.UpdateEquipment]: {
            fields: [
                "id",
                "mainhand",
                "offhand",
                "helmet",
                "backpack",
            ] as const,
            validator: typia.createIs<ServerPacket.UpdateEquipment>(),
            world: true,
        },
        [ServerPacket.DeleteObjects]: {
            fields: ["objects"] as const,
            validator: typia.createIs<ServerPacket.DeleteObjects>(),
        },
        [ServerPacket.Ping]: {
            fields: [] as const,
            validator: typia.createIs<ServerPacket.Ping>(),
        },
        [ServerPacket.DebugDrawPolygon]: {
            fields: ["startX", "startY", "points"] as const,
            validator: typia.createIs<ServerPacket.DebugDrawPolygon>(),
        },
        [ServerPacket.ChatMessage]: {
            fields: ["id", "message"] as const,
            validator: typia.createIs<ServerPacket.ChatMessage>(),
            world: true,
        },
        [ServerPacket.LoadGround]: {
            fields: ["groundData"] as const,
            validator: typia.createIs<ServerPacket.LoadGround>(),
        },
        [ServerPacket.ClientConnectionInfo]: {
            fields: ["playerId", "serverStartTime"] as const,
            validator: typia.createIs<ServerPacket.ClientConnectionInfo>(),
        },
        [ServerPacket.RecipeList]: {
            fields: ["recipes"] as const,
            validator: typia.createIs<ServerPacket.RecipeList>(),
        },
        [ServerPacket.SetSelectedStructure]: {
            fields: ["structureId", "structureSize"] as const,
            validator: typia.createIs<ServerPacket.SetSelectedStructure>(),
        },
        [ServerPacket.AttackEvent]: {
            fields: ["id"],
            validator: typia.createIs<ServerPacket.AttackEvent>(),
            world: true,
        },
        [ServerPacket.BlockEvent]: {
            fields: ["id", "stop"],
            validator: typia.createIs<ServerPacket.BlockEvent>(),
            world: true,
        },
        [ServerPacket.HitEvent]: {
            fields: ["id", "angle"],
            validator: typia.createIs<ServerPacket.HitEvent>(),
            world: true,
        },
    } as const;

    export const Client = {
        [ClientPacket.Rotation]: {
            fields: ["rotation"] as const,
            validator: typia.createIs<ClientPacket.Rotation>(),
        },
        [ClientPacket.Movement]: {
            fields: ["direction"] as const,
            validator: typia.createIs<ClientPacket.Movement>(),
        },
        [ClientPacket.RequestObjects]: {
            fields: ["objects"] as const,
            validator: typia.createIs<ClientPacket.RequestObjects>(),
        },
        [ClientPacket.RequestPlacementValidity]: {
            fields: ["itemId", "onGrid"] as const,
            validator: typia.createIs<ClientPacket.RequestPlacementValidity>(),
        },
        [ClientPacket.Attack]: {
            fields: ["stop"] as const,
            validator: typia.createIs<ClientPacket.Attack>(),
        },
        [ClientPacket.Block]: {
            fields: ["stop"] as const,
            validator: typia.createIs<ClientPacket.Block>(),
        },
        [ClientPacket.SelectItem]: {
            fields: ["itemId"] as const,
            validator: typia.createIs<ClientPacket.SelectItem>(),
        },
        [ClientPacket.Ping]: {
            fields: [] as const,
            validator: typia.createIs<ClientPacket.Ping>(),
        },
        [ClientPacket.CraftItem]: {
            fields: ["itemId"] as const,
            validator: typia.createIs<ClientPacket.CraftItem>(),
        },
        [ClientPacket.ChatMessage]: {
            fields: ["message"] as const,
            validator: typia.createIs<ClientPacket.ChatMessage>(),
        },
        [ClientPacket.DropItem]: {
            fields: ["itemId", "dropAll"] as const,
            validator: typia.createIs<ClientPacket.DropItem>(),
        },
    } as const;
}

export type ServerPacketMap = {
    [ServerPacket.SetRotation]: ServerPacket.SetRotation;
    [ServerPacket.SetPosition]: ServerPacket.SetPosition;
    [ServerPacket.PlacementValidity]: ServerPacket.PlacementValidity;
    [ServerPacket.LoadPlayer]: ServerPacket.LoadPlayer;
    [ServerPacket.UnloadObjects]: ServerPacket.UnloadObjects;
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
};

export type ClientPacketMap = {
    [ClientPacket.Rotation]: ClientPacket.Rotation;
    [ClientPacket.Movement]: ClientPacket.Movement;
    [ClientPacket.RequestObjects]: ClientPacket.RequestObjects;
    [ClientPacket.RequestPlacementValidity]: ClientPacket.RequestPlacementValidity;
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
