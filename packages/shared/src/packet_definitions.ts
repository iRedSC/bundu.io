import type { GameObjectData } from "./object_types";

/** Server → client packet IDs. */
export const ServerPacket = {
    SetRotation: 0x00,
    SetPosition: 0x01,
    LoadObject: 0x04,
    UpdateVitals: 0x06,
    UpdateInventory: 0x07,
    UpdateEquipment: 0x08,
    DeleteObjects: 0x09,
    ChatMessage: 0x0c,
    LoadGround: 0x0d,
    ClientConnectionInfo: 0x0e,
    RecipeList: 0x0f,
    SetSelectedStructure: 0x10,
    AttackEvent: 0x11,
    BlockEvent: 0x12,
    HitEvent: 0x13,
    /** `duration > 0` starts a craft channel; `duration === 0` ends it. */
    CraftEvent: 0x14,
    PlaceStructureResult: 0x15,
    DropItem: 0x16,
} as const;

/** Payload shapes for `ServerPacket.*` (merged with the const above). */
export namespace ServerPacket {
    export type SetRotation = { id: number; rotation: number };
    export type SetPosition = { id: number; x: number; y: number };
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
    export type UpdateVitals = {
        health: number;
        hunger: number;
        heat: number;
    };
    export type UpdateInventory = {
        items: ([itemId: number, count: number] | null)[];
        cursor: [itemId: number, count: number] | null;
    };
    export type UpdateEquipment = {
        id: number;
        mainhand: number;
        offhand: number;
        helmet: number;
        backpack: boolean;
    };
    export type DeleteObjects = { objects: number[] };
    export type ChatMessage = { id: number; message: string };
    export type LoadGround = {
        groundData: [
            type: number,
            x: number,
            y: number,
            w: number,
            h: number,
        ][];
    };
    export type ClientConnectionInfo = {
        playerId: number;
        serverStartTime: number;
    };
    export type RecipeList = {
        recipes: [
            itemId: number,
            requirements: [requiredItemId: number, amount: number][],
            flags: number[],
        ][];
    };
    export type SetSelectedStructure = {
        structureId: number;
    };
    export type AttackEvent = {
        id: number;
        /** Offset from attacker center along facing before the box starts. */
        start: number;
        /** Box length along facing. */
        length: number;
        /** Box width perpendicular to facing. */
        width: number;
    };
    export type BlockEvent = { id: number; stop: boolean };
    export type HitEvent = { id: number; angle: number };
    export type CraftEvent = { id: number; duration: number };
    export type PlaceStructureResult = {
        allowed: boolean;
        x: number;
        y: number;
        rotation: number;
    };
    /** Item spawned by `id` at the given world position. */
    export type DropItem = {
        id: number;
        objectId: number;
        itemId: number;
        x: number;
        y: number;
    };
}

/** Client → server packet IDs. */
export const ClientPacket = {
    Rotation: 0x00,
    Movement: 0x01,
    Attack: 0x04,
    SelectItem: 0x05,
    MoveSlot: 0x06,
    CraftItem: 0x07,
    ChatMessage: 0x08,
    CursorSlot: 0x09,
    Block: 0x0c,
    PlaceStructureAt: 0x0d,
    PlaceStructure: 0x0e,
    SetStructurePlacement: 0x0f,
} as const;

export namespace ClientPacket {
    export type Rotation = { rotation: number };
    export type Movement = { direction: number };
    export type Attack = { stop: boolean };
    export type SelectItem = { slot: number };
    /** `to === -1` drops the stack from `from` outside the hotbar. */
    export type MoveSlot = { from: number; to: number };
    export type CraftItem = { itemId: number };
    export type ChatMessage = { message: string };
    /**
     * Right-click cursor: pick / place / swap.
     * `slot === -1` drops from the cursor (mode = all/half/one).
     */
    export type CursorSlot = { slot: number; mode: number };
    export type Block = { stop: boolean };
    export type PlaceStructureAt = {
        structureId: number;
        x: number;
        y: number;
        rotation: number;
    };
    export type PlaceStructure = {};
    export type SetStructurePlacement = {
        rotation: number;
        x: number;
        y: number;
    };
}

/** ID → payload map for server packets. */
export type ServerPacketMap = {
    [ServerPacket.SetRotation]: ServerPacket.SetRotation;
    [ServerPacket.SetPosition]: ServerPacket.SetPosition;
    [ServerPacket.LoadObject]: ServerPacket.LoadObject;
    [ServerPacket.UpdateVitals]: ServerPacket.UpdateVitals;
    [ServerPacket.UpdateInventory]: ServerPacket.UpdateInventory;
    [ServerPacket.UpdateEquipment]: ServerPacket.UpdateEquipment;
    [ServerPacket.DeleteObjects]: ServerPacket.DeleteObjects;
    [ServerPacket.ChatMessage]: ServerPacket.ChatMessage;
    [ServerPacket.LoadGround]: ServerPacket.LoadGround;
    [ServerPacket.ClientConnectionInfo]: ServerPacket.ClientConnectionInfo;
    [ServerPacket.RecipeList]: ServerPacket.RecipeList;
    [ServerPacket.SetSelectedStructure]: ServerPacket.SetSelectedStructure;
    [ServerPacket.AttackEvent]: ServerPacket.AttackEvent;
    [ServerPacket.BlockEvent]: ServerPacket.BlockEvent;
    [ServerPacket.HitEvent]: ServerPacket.HitEvent;
    [ServerPacket.CraftEvent]: ServerPacket.CraftEvent;
    [ServerPacket.PlaceStructureResult]: ServerPacket.PlaceStructureResult;
    [ServerPacket.DropItem]: ServerPacket.DropItem;
};

/** ID → payload map for client packets. */
export type ClientPacketMap = {
    [ClientPacket.Rotation]: ClientPacket.Rotation;
    [ClientPacket.Movement]: ClientPacket.Movement;
    [ClientPacket.Attack]: ClientPacket.Attack;
    [ClientPacket.SelectItem]: ClientPacket.SelectItem;
    [ClientPacket.MoveSlot]: ClientPacket.MoveSlot;
    [ClientPacket.CraftItem]: ClientPacket.CraftItem;
    [ClientPacket.ChatMessage]: ClientPacket.ChatMessage;
    [ClientPacket.CursorSlot]: ClientPacket.CursorSlot;
    [ClientPacket.Block]: ClientPacket.Block;
    [ClientPacket.PlaceStructureAt]: ClientPacket.PlaceStructureAt;
    [ClientPacket.PlaceStructure]: ClientPacket.PlaceStructure;
    [ClientPacket.SetStructurePlacement]: ClientPacket.SetStructurePlacement;
};

export type ServerPacketID = keyof ServerPacketMap;
export type ClientPacketID = keyof ClientPacketMap;

/** Field order for msgpack serialization. */
export const ServerSchema: {
    [K in ServerPacketID]: {
        fields: readonly (keyof ServerPacketMap[K] & string)[];
    };
} = {
    [ServerPacket.SetRotation]: { fields: ["id", "rotation"] },
    [ServerPacket.SetPosition]: { fields: ["id", "x", "y"] },
    [ServerPacket.LoadObject]: {
        fields: ["id", "type", "x", "y", "rotation", "data"],
    },
    [ServerPacket.UpdateVitals]: { fields: ["health", "hunger", "heat"] },
    [ServerPacket.UpdateInventory]: { fields: ["items", "cursor"] },
    [ServerPacket.UpdateEquipment]: {
        fields: ["id", "mainhand", "offhand", "helmet", "backpack"],
    },
    [ServerPacket.DeleteObjects]: { fields: ["objects"] },
    [ServerPacket.ChatMessage]: { fields: ["id", "message"] },
    [ServerPacket.LoadGround]: { fields: ["groundData"] },
    [ServerPacket.ClientConnectionInfo]: {
        fields: ["playerId", "serverStartTime"],
    },
    [ServerPacket.RecipeList]: { fields: ["recipes"] },
    [ServerPacket.SetSelectedStructure]: {
        fields: ["structureId"],
    },
    [ServerPacket.AttackEvent]: {
        fields: ["id", "start", "length", "width"],
    },
    [ServerPacket.BlockEvent]: { fields: ["id", "stop"] },
    [ServerPacket.HitEvent]: { fields: ["id", "angle"] },
    [ServerPacket.CraftEvent]: { fields: ["id", "duration"] },
    [ServerPacket.PlaceStructureResult]: {
        fields: ["allowed", "x", "y", "rotation"],
    },
    [ServerPacket.DropItem]: {
        fields: ["id", "objectId", "itemId", "x", "y"],
    },
};

export const ClientSchema: {
    [K in ClientPacketID]: {
        fields: readonly (keyof ClientPacketMap[K] & string)[];
    };
} = {
    [ClientPacket.Rotation]: { fields: ["rotation"] },
    [ClientPacket.Movement]: { fields: ["direction"] },
    [ClientPacket.Attack]: { fields: ["stop"] },
    [ClientPacket.SelectItem]: { fields: ["slot"] },
    [ClientPacket.MoveSlot]: { fields: ["from", "to"] },
    [ClientPacket.CraftItem]: { fields: ["itemId"] },
    [ClientPacket.ChatMessage]: { fields: ["message"] },
    [ClientPacket.CursorSlot]: { fields: ["slot", "mode"] },
    [ClientPacket.Block]: { fields: ["stop"] },
    [ClientPacket.PlaceStructureAt]: {
        fields: ["structureId", "x", "y", "rotation"],
    },
    [ClientPacket.PlaceStructure]: { fields: [] },
    [ClientPacket.SetStructurePlacement]: {
        fields: ["rotation", "x", "y"],
    },
};
