import type { GameObjectData } from "./object_types.js";

/**
 * Single source of truth for each packet: id + field order + payload type.
 * Consts, Schema, PacketMaps, and named types are derived from these defs.
 */
function packet<Payload>() {
    return <
        Id extends number,
        const Fields extends readonly (keyof Payload & string)[],
    >(
        id: Id,
        fields: Fields
    ) =>
        ({ id, fields }) as {
            readonly id: Id;
            readonly fields: Fields;
            readonly __payload: Payload;
        };
}

const serverPacketDefs = {
    SetRotation: packet<{ id: number; rotation: number }>()(0x00, [
        "id",
        "rotation",
    ]),
    SetPosition: packet<{ id: number; x: number; y: number }>()(0x01, [
        "id",
        "x",
        "y",
    ]),
    LoadObject: packet<{
        [T in keyof GameObjectData.ByType]: {
            id: number;
            x: number;
            y: number;
            rotation: number;
            type: T;
            data: GameObjectData.ByType[T];
        };
    }[keyof GameObjectData.ByType]>()(0x04, [
        "id",
        "type",
        "x",
        "y",
        "rotation",
        "data",
    ]),
    UpdateVitals: packet<{
        health: number;
        hunger: number;
        heat: number;
    }>()(0x06, ["health", "hunger", "heat"]),
    UpdateInventory: packet<{
        items: ([itemId: number, count: number] | null)[];
    }>()(0x07, ["items"]),
    UpdateEquipment: packet<{
        id: number;
        mainhand: number;
        offhand: number;
        helmet: number;
        backpack: boolean;
    }>()(0x08, ["id", "mainhand", "offhand", "helmet", "backpack"]),
    DeleteObjects: packet<{ objects: number[] }>()(0x09, ["objects"]),
    Ping: packet<Record<PropertyKey, never>>()(0x0a, []),
    DebugDrawPolygon: packet<{
        startX: number;
        startY: number;
        points: [x: number, y: number][];
    }>()(0x0b, ["startX", "startY", "points"]),
    ChatMessage: packet<{ id: number; message: string }>()(0x0c, [
        "id",
        "message",
    ]),
    LoadGround: packet<{
        groundData: [
            type: number,
            x: number,
            y: number,
            w: number,
            h: number,
        ][];
    }>()(0x0d, ["groundData"]),
    ClientConnectionInfo: packet<{
        playerId: number;
        serverStartTime: number;
    }>()(0x0e, ["playerId", "serverStartTime"]),
    RecipeList: packet<{
        recipes: [
            itemId: number,
            requirements: [requiredItemId: number, amount: number][],
            flags: number[],
        ][];
    }>()(0x0f, ["recipes"]),
    SetSelectedStructure: packet<{
        structureId: number;
        structureSize: number;
    }>()(0x10, ["structureId", "structureSize"]),
    AttackEvent: packet<{ id: number }>()(0x11, ["id"]),
    BlockEvent: packet<{ id: number; stop: boolean }>()(0x12, ["id", "stop"]),
    HitEvent: packet<{ id: number; angle: number }>()(0x13, ["id", "angle"]),
    DebugDrawRects: packet<{
        rects: [x: number, y: number, w: number, h: number][];
    }>()(0x14, ["rects"]),
} as const;

const clientPacketDefs = {
    Rotation: packet<{ rotation: number }>()(0x00, ["rotation"]),
    Movement: packet<{ direction: number }>()(0x01, ["direction"]),
    Attack: packet<{ stop: boolean }>()(0x04, ["stop"]),
    SelectItem: packet<{ itemId: number }>()(0x05, ["itemId"]),
    Ping: packet<Record<PropertyKey, never>>()(0x06, []),
    CraftItem: packet<{ itemId: number }>()(0x07, ["itemId"]),
    ChatMessage: packet<{ message: string }>()(0x08, ["message"]),
    DropItem: packet<{ itemId: number; dropAll: boolean }>()(0x09, [
        "itemId",
        "dropAll",
    ]),
    Block: packet<{ stop: boolean }>()(0x0c, ["stop"]),
} as const;

type PacketDefs = Record<
    string,
    {
        readonly id: number;
        readonly fields: readonly string[];
        readonly __payload: unknown;
    }
>;

type PacketMapFromDefs<D extends PacketDefs> = {
    [K in keyof D as D[K]["id"]]: D[K]["__payload"];
};

type SchemaFromDefs<D extends PacketDefs> = {
    [K in keyof D as D[K]["id"]]: { readonly fields: D[K]["fields"] };
};

function toSchema<D extends PacketDefs>(defs: D): SchemaFromDefs<D> {
    const out: Record<number, { fields: readonly string[] }> = {};
    for (const def of Object.values(defs)) {
        out[def.id] = { fields: def.fields };
    }
    return out as SchemaFromDefs<D>;
}

function toPacketIds<D extends PacketDefs>(defs: D) {
    const out = {} as { [K in keyof D]: D[K]["id"] };
    for (const key of Object.keys(defs) as (keyof D)[]) {
        const def = defs[key];
        if (def === undefined) continue;
        out[key] = def.id;
    }
    return out;
}

/** Field order for msgpack serialization. Derived from packet defs. */
export namespace Schema {
    export const Server = toSchema(serverPacketDefs);
    export const Client = toSchema(clientPacketDefs);
}

export type ServerPacketMap = PacketMapFromDefs<typeof serverPacketDefs>;
export type ClientPacketMap = PacketMapFromDefs<typeof clientPacketDefs>;

export type ServerPacketID = keyof ServerPacketMap;
export type ClientPacketID = keyof ClientPacketMap;

/** Packet IDs (values) + payload types (namespace), both derived from defs. */
export const ServerPacket = toPacketIds(serverPacketDefs);
export namespace ServerPacket {
    export type SetRotation =
        (typeof serverPacketDefs)["SetRotation"]["__payload"];
    export type SetPosition =
        (typeof serverPacketDefs)["SetPosition"]["__payload"];
    export type LoadObject = (typeof serverPacketDefs)["LoadObject"]["__payload"];
    export type UpdateVitals =
        (typeof serverPacketDefs)["UpdateVitals"]["__payload"];
    export type UpdateInventory =
        (typeof serverPacketDefs)["UpdateInventory"]["__payload"];
    export type UpdateEquipment =
        (typeof serverPacketDefs)["UpdateEquipment"]["__payload"];
    export type DeleteObjects =
        (typeof serverPacketDefs)["DeleteObjects"]["__payload"];
    export type Ping = (typeof serverPacketDefs)["Ping"]["__payload"];
    export type DebugDrawPolygon =
        (typeof serverPacketDefs)["DebugDrawPolygon"]["__payload"];
    export type ChatMessage =
        (typeof serverPacketDefs)["ChatMessage"]["__payload"];
    export type LoadGround = (typeof serverPacketDefs)["LoadGround"]["__payload"];
    export type ClientConnectionInfo =
        (typeof serverPacketDefs)["ClientConnectionInfo"]["__payload"];
    export type RecipeList = (typeof serverPacketDefs)["RecipeList"]["__payload"];
    export type SetSelectedStructure =
        (typeof serverPacketDefs)["SetSelectedStructure"]["__payload"];
    export type AttackEvent =
        (typeof serverPacketDefs)["AttackEvent"]["__payload"];
    export type BlockEvent = (typeof serverPacketDefs)["BlockEvent"]["__payload"];
    export type HitEvent = (typeof serverPacketDefs)["HitEvent"]["__payload"];
    export type DebugDrawRects =
        (typeof serverPacketDefs)["DebugDrawRects"]["__payload"];
}

export const ClientPacket = toPacketIds(clientPacketDefs);
export namespace ClientPacket {
    export type Rotation = (typeof clientPacketDefs)["Rotation"]["__payload"];
    export type Movement = (typeof clientPacketDefs)["Movement"]["__payload"];
    export type Attack = (typeof clientPacketDefs)["Attack"]["__payload"];
    export type SelectItem = (typeof clientPacketDefs)["SelectItem"]["__payload"];
    export type Ping = (typeof clientPacketDefs)["Ping"]["__payload"];
    export type CraftItem = (typeof clientPacketDefs)["CraftItem"]["__payload"];
    export type ChatMessage =
        (typeof clientPacketDefs)["ChatMessage"]["__payload"];
    export type DropItem = (typeof clientPacketDefs)["DropItem"]["__payload"];
    export type Block = (typeof clientPacketDefs)["Block"]["__payload"];
}
