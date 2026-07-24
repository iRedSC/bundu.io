import type {
    EntityStateSnapshot,
    GameObjectData,
} from "./object_types";
import { PlaceMode } from "./inventory";
import type { PacketGuards } from "./network/serializer";
import {
    isValidWorldTiles,
    MAX_WORLD_BOUNDS,
    WORLD_BOUNDS,
    WORLD_TILES,
} from "./tiles";
import type { CommandProjection } from "./command";

/**
 * Max ViewBounds edge length. Freecam min zoom (~0.05) on a large display can
 * exceed 2× world size; keep headroom without accepting unbounded spam.
 * Capped against {@link MAX_WORLD_BOUNDS} so the wire limit stays valid after
 * runtime world-size changes.
 */
export const FREECAM_MAX_VIEW_EXTENT = MAX_WORLD_BOUNDS * 5;

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
    UpdateObjectHealth: 0x17,
    Leaderboard: 0x18,
    SetStructureState: 0x19,
    /** `duration > 0` starts eating; `duration === 0` cancels or completes it. */
    EatEvent: 0x1a,
    /** Authoritative day/night period index (morning/day/evening/night). */
    SetTimeOfDay: 0x1b,
    /** Freecam spectate/edit mode toggled by `/freecam`. */
    FreecamMode: 0x1c,
    /** Freecam editor: remove ground rects (undo / delete). */
    UnloadGround: 0x1d,
    /** Freecam editor: map YAML for download or after server save. */
    AdminMapYaml: 0x1e,
    /** Static decoration sprites (join sync + live editor edits). */
    LoadDecorations: 0x1f,
    /** Freecam editor: remove decorations (undo / delete). */
    UnloadDecorations: 0x20,
    /** Owning client's effective sourced flags (crafting + gameplay). */
    UpdateFlags: 0x21,
    /** Commands the player may see/run (filtered by opLevel). */
    CommandRegistry: 0x22,
    /** Private command feedback for the executor. */
    CommandResult: 0x23,
    /** Creative mode toggled by `/creative` (item give + cheat toolbar). */
    CreativeMode: 0x24,
    /** Authoritative playable world size in tiles (join + new/import map). */
    SetWorldSize: 0x25,
    /**
     * Viewer-relative hide visual: subject's model alpha (not the anon proxy).
     * Sent per viewer via player packets.
     */
    SetPlayerVisual: 0x26,
    /**
     * Owner-only item locks: `[itemId, remainingMs, durationMs, flags]`.
     * `remainingMs === -1` means locked until unlockItem (no wipe timer).
     * `flags` is a bitmask of equip|unequip|use|drop|craft (see item_lock.ts).
     */
    UpdateItemLocks: 0x27,
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
        thirst: number;
        air: number;
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
    /**
     * Ground rect wire tuple. `id` is the entity id — stack order is ascending id
     * (higher id paints on top), matching map YAML and server `topGroundAt`.
     */
    export type GroundWire = [
        id: number,
        type: number,
        x: number,
        y: number,
        w: number,
        h: number,
    ];
    export type LoadGround = {
        groundData: GroundWire[];
    };
    export type ClientConnectionInfo = {
        playerId: number;
    };
    export type RecipeList = {
        recipes: [
            recipeId: number,
            resultItemId: number,
            resultAmount: number,
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
    /** `strength` 0–10 scales client hit FX (wiggle / knockback / particles). */
    /** `flash` — {@link import("./hit_flash").HitFlash} tint for living entities. */
    export type HitEvent = {
        id: number;
        angle: number;
        strength: number;
        flash: number;
    };
    export type CraftEvent = {
        id: number;
        duration: number;
        recipeId: number;
        itemId: number;
    };
    export type PlaceStructureResult = {
        allowed: boolean;
        x: number;
        y: number;
        rotation: number;
    };
    /** Item spawned by `id` at the given integer decitile position. */
    export type DropItem = {
        id: number;
        objectId: number;
        itemId: number;
        x: number;
        y: number;
    };
    export type UpdateObjectHealth = {
        id: number;
        health: number;
        maxHealth: number;
    };
    export type Leaderboard = {
        entries: { id: number; name: string; score: number }[];
    };
    /** Authoritative structure-state projection (coalesced latest-wins). */
    export type SetStructureState = {
        id: number;
        states: EntityStateSnapshot;
    };
    export type EatEvent = { id: number; duration: number };
    /** Period index into the server day cycle (0=morning … 3=night). */
    export type SetTimeOfDay = { period: number };
    export type FreecamMode = { enabled: boolean };
    /** Creative inventory/cheat mode (player stays in world; HUD stays up). */
    export type CreativeMode = {
        enabled: boolean;
        godmode: boolean;
        /** Multiplier: 0.5 | 1 | 2 | 4 */
        speed: number;
        instakill: boolean;
    };
    /** Square world edge length in tiles. */
    export type SetWorldSize = { worldTiles: number };
    /** Toggle semi-transparent model for a loaded player (viewer-relative). */
    export type SetPlayerVisual = {
        id: number;
        ghosted: boolean;
    };
    /**
     * Per-item lock state for the owning client's inventory UI.
     * Tuple: `[itemId, remainingMs, durationMs, flags]`.
     * `remainingMs === -1` = permanent until unlockItem.
     * `flags` bitmask: equip=1, unequip=2, use=4, drop=8, craft=16.
     */
    export type UpdateItemLocks = {
        locks: [itemId: number, remainingMs: number, durationMs: number, flags: number][];
    };
    export type UnloadGround = {
        groundData: GroundWire[];
    };
    export type AdminMapYaml = {
        yaml: string;
        /** True when the server also wrote the file to disk. */
        saved: boolean;
        path: string;
    };
    /**
     * Decoration wire tuple. World units for x/y; rotation in degrees;
     * scale multiplies the registry base size.
     */
    export type DecorationWire = [
        id: number,
        type: number,
        x: number,
        y: number,
        rotation: number,
        scale: number,
    ];
    export type LoadDecorations = {
        decorations: DecorationWire[];
    };
    export type UnloadDecorations = {
        decorations: DecorationWire[];
    };
    /** Effective flag ids currently granted to the receiving player. */
    export type UpdateFlags = {
        flags: number[];
    };
    /** Serializable command tree slice visible to this player. */
    export type CommandRegistry = {
        commands: CommandProjection[];
    };
    /** Private system line for command success/failure. */
    export type CommandResult = {
        message: string;
        ok: boolean;
    };
}

/** Admin editor place target (freecam palette). */
export const AdminPlaceKind = {
    Resource: 0,
    Structure: 1,
    Ground: 2,
    Decoration: 3,
    Animal: 4,
} as const;
export type AdminPlaceKind =
    (typeof AdminPlaceKind)[keyof typeof AdminPlaceKind];

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
    /** 0x0d reserved — was PlaceStructureAt (debug); use AdminPlace in freecam. */
    PlaceStructure: 0x0e,
    SetStructurePlacement: 0x0f,
    /** Freecam screenspace world AABB + overview (no dynamic movers). */
    ViewBounds: 0x10,
    /** Freecam editor: place resource / structure / ground at a tile. */
    AdminPlace: 0x11,
    /** Freecam editor: delete the active-tab kind under a world point. */
    AdminDeleteAt: 0x12,
    /** Freecam editor: pause/resume animal AI ticking. */
    AdminSetAnimalsFrozen: 0x13,
    /** Freecam editor: kill every animal. */
    AdminKillAnimals: 0x14,
    /** Freecam editor: start a place/delete stroke (undo unit). */
    AdminStrokeBegin: 0x15,
    /** Freecam editor: end the current stroke. */
    AdminStrokeEnd: 0x16,
    /** Freecam editor: undo last stroke. */
    AdminUndo: 0x17,
    /** Freecam editor: redo last undone stroke. */
    AdminRedo: 0x18,
    /** Freecam editor: write map YAML on the server and return it. */
    AdminSaveMap: 0x19,
    /** Freecam editor: return map YAML for client download (no disk write). */
    AdminDownloadMap: 0x1a,
    /** Freecam editor: clear map and create a blank ocean world of `worldTiles`. */
    AdminNewMap: 0x1b,
    /** Freecam editor: clear map and load placeables from YAML. */
    AdminImportMap: 0x28,
    /** Client finished local load (terrain, etc.) — server may spawn / loadView. */
    ClientReady: 0x1c,
    /** Exit freecam and relocate the parked body to a world point. */
    ExitFreecamAt: 0x1d,
    /** Freecam ghost cursor world position (throttled). */
    FreecamCursor: 0x1e,
    /** Freecam: show ghost to non-freecam players (default off). */
    AdminSetGhostVisible: 0x1f,
    /** Creative: give an item stack to self. */
    CreativeGive: 0x20,
    /** Creative: freeze vitals / ignore damage. */
    CreativeSetGodmode: 0x21,
    /** Creative: movement speed multiplier index (0.5× / 1× / 2× / 4×). */
    CreativeSetSpeed: 0x22,
    /** Creative: massive attack.damage boost. */
    CreativeSetInstakill: 0x23,
    /** Creative: put an item stack on the cursor (replaces cursor). */
    CreativeGiveToCursor: 0x24,
    /** Creative: destroy cursor (`slot === -1`) or an inventory slot. */
    CreativeVoid: 0x25,
    /** Creative: clear all inventory slots + cursor. */
    CreativeClearInventory: 0x26,
    /** Creative: grant a named kit into inventory. */
    CreativeGiveKit: 0x27,
} as const;

export namespace ClientPacket {
    export type Rotation = { rotation: number };
    export type Movement = { direction: number };
    export type Attack = { stop: boolean };
    export type SelectItem = { slot: number };
    /** `to === -1` drops the stack from `from` outside the hotbar. */
    export type MoveSlot = { from: number; to: number };
    export type CraftItem = { recipeId: number };
    export type ChatMessage = { message: string };
    /**
     * Right-click cursor: pick / place / swap.
     * `slot === -1` drops from the cursor (mode = all/half/one).
     */
    export type CursorSlot = { slot: number; mode: number };
    export type Block = { stop: boolean };
    export type PlaceStructure = Record<string, never>;
    export type SetStructurePlacement = {
        rotation: number;
        x: number;
        y: number;
    };
    export type ViewBounds = {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        overview: boolean;
    };
    export type AdminPlace = {
        kind: AdminPlaceKind;
        typeId: number;
        /**
         * Tile indices for resource/structure/ground.
         * World units for decorations/animals (free placement).
         */
        x: number;
        y: number;
        /**
         * Tile quarter-turns 0–3 for resource/structure.
         * Continuous degrees for decorations.
         * Ignored for animals (use 0).
         */
        rotation: number;
        /** Variant wire id (from pack-autogen variant map); ignored for ground/decoration/animal. */
        variant: number;
        /** Ground rect size in tiles (normalized); ignored for non-ground (use 1). */
        w: number;
        h: number;
        /** Decoration size multiplier (base × scale). Ignored otherwise (use 1). */
        scale: number;
    };
    /**
     * World-space click for freecam delete (tile derived server-side).
     * `kind` scopes the hit to the active palette tab.
     */
    export type AdminDeleteAt = { x: number; y: number; kind: AdminPlaceKind };
    export type AdminSetAnimalsFrozen = { frozen: boolean };
    export type AdminKillAnimals = Record<string, never>;
    export type AdminStrokeBegin = Record<string, never>;
    export type AdminStrokeEnd = Record<string, never>;
    export type AdminUndo = Record<string, never>;
    export type AdminRedo = Record<string, never>;
    export type AdminSaveMap = Record<string, never>;
    export type AdminDownloadMap = Record<string, never>;
    /** Create a blank ocean map at the given square tile size. */
    export type AdminNewMap = { worldTiles: number };
    /** Replace the live map from editor YAML (clears existing placeables). */
    export type AdminImportMap = { yaml: string };
    export type ClientReady = Record<string, never>;
    /** World-space drop point for freecam exit-with-teleport. */
    export type ExitFreecamAt = { x: number; y: number };
    /** World-space freecam pointer for the networked ghost cursor. */
    export type FreecamCursor = { x: number; y: number };
    export type AdminSetGhostVisible = { visible: boolean };
    export type CreativeGive = { itemId: number; count: number };
    export type CreativeSetGodmode = { enabled: boolean };
    /** One of 0.5, 1, 2, 4. */
    export type CreativeSetSpeed = { speed: number };
    export type CreativeSetInstakill = { enabled: boolean };
    export type CreativeGiveToCursor = { itemId: number; count: number };
    /** `slot === -1` voids the cursor; otherwise voids that inventory slot. */
    export type CreativeVoid = { slot: number };
    export type CreativeClearInventory = Record<string, never>;
    /** Kit id key from shared `KITS` (e.g. `"copper"`). */
    export type CreativeGiveKit = { kitId: string };
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
    [ServerPacket.UpdateObjectHealth]: ServerPacket.UpdateObjectHealth;
    [ServerPacket.Leaderboard]: ServerPacket.Leaderboard;
    [ServerPacket.SetStructureState]: ServerPacket.SetStructureState;
    [ServerPacket.EatEvent]: ServerPacket.EatEvent;
    [ServerPacket.SetTimeOfDay]: ServerPacket.SetTimeOfDay;
    [ServerPacket.FreecamMode]: ServerPacket.FreecamMode;
    [ServerPacket.UnloadGround]: ServerPacket.UnloadGround;
    [ServerPacket.AdminMapYaml]: ServerPacket.AdminMapYaml;
    [ServerPacket.LoadDecorations]: ServerPacket.LoadDecorations;
    [ServerPacket.UnloadDecorations]: ServerPacket.UnloadDecorations;
    [ServerPacket.UpdateFlags]: ServerPacket.UpdateFlags;
    [ServerPacket.CommandRegistry]: ServerPacket.CommandRegistry;
    [ServerPacket.CommandResult]: ServerPacket.CommandResult;
    [ServerPacket.CreativeMode]: ServerPacket.CreativeMode;
    [ServerPacket.SetWorldSize]: ServerPacket.SetWorldSize;
    [ServerPacket.SetPlayerVisual]: ServerPacket.SetPlayerVisual;
    [ServerPacket.UpdateItemLocks]: ServerPacket.UpdateItemLocks;
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
    [ClientPacket.PlaceStructure]: ClientPacket.PlaceStructure;
    [ClientPacket.SetStructurePlacement]: ClientPacket.SetStructurePlacement;
    [ClientPacket.ViewBounds]: ClientPacket.ViewBounds;
    [ClientPacket.AdminPlace]: ClientPacket.AdminPlace;
    [ClientPacket.AdminDeleteAt]: ClientPacket.AdminDeleteAt;
    [ClientPacket.AdminSetAnimalsFrozen]: ClientPacket.AdminSetAnimalsFrozen;
    [ClientPacket.AdminKillAnimals]: ClientPacket.AdminKillAnimals;
    [ClientPacket.AdminStrokeBegin]: ClientPacket.AdminStrokeBegin;
    [ClientPacket.AdminStrokeEnd]: ClientPacket.AdminStrokeEnd;
    [ClientPacket.AdminUndo]: ClientPacket.AdminUndo;
    [ClientPacket.AdminRedo]: ClientPacket.AdminRedo;
    [ClientPacket.AdminSaveMap]: ClientPacket.AdminSaveMap;
    [ClientPacket.AdminDownloadMap]: ClientPacket.AdminDownloadMap;
    [ClientPacket.AdminNewMap]: ClientPacket.AdminNewMap;
    [ClientPacket.AdminImportMap]: ClientPacket.AdminImportMap;
    [ClientPacket.ClientReady]: ClientPacket.ClientReady;
    [ClientPacket.ExitFreecamAt]: ClientPacket.ExitFreecamAt;
    [ClientPacket.FreecamCursor]: ClientPacket.FreecamCursor;
    [ClientPacket.AdminSetGhostVisible]: ClientPacket.AdminSetGhostVisible;
    [ClientPacket.CreativeGive]: ClientPacket.CreativeGive;
    [ClientPacket.CreativeSetGodmode]: ClientPacket.CreativeSetGodmode;
    [ClientPacket.CreativeSetSpeed]: ClientPacket.CreativeSetSpeed;
    [ClientPacket.CreativeSetInstakill]: ClientPacket.CreativeSetInstakill;
    [ClientPacket.CreativeGiveToCursor]: ClientPacket.CreativeGiveToCursor;
    [ClientPacket.CreativeVoid]: ClientPacket.CreativeVoid;
    [ClientPacket.CreativeClearInventory]: ClientPacket.CreativeClearInventory;
    [ClientPacket.CreativeGiveKit]: ClientPacket.CreativeGiveKit;
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
    [ServerPacket.UpdateVitals]: {
        fields: ["health", "hunger", "heat", "thirst", "air"],
    },
    [ServerPacket.UpdateInventory]: { fields: ["items", "cursor"] },
    [ServerPacket.UpdateEquipment]: {
        fields: ["id", "mainhand", "offhand", "helmet", "backpack"],
    },
    [ServerPacket.DeleteObjects]: { fields: ["objects"] },
    [ServerPacket.ChatMessage]: { fields: ["id", "message"] },
    [ServerPacket.LoadGround]: { fields: ["groundData"] },
    [ServerPacket.ClientConnectionInfo]: {
        fields: ["playerId"],
    },
    [ServerPacket.RecipeList]: { fields: ["recipes"] },
    [ServerPacket.SetSelectedStructure]: {
        fields: ["structureId"],
    },
    [ServerPacket.AttackEvent]: {
        fields: ["id", "start", "length", "width"],
    },
    [ServerPacket.BlockEvent]: { fields: ["id", "stop"] },
    [ServerPacket.HitEvent]: { fields: ["id", "angle", "strength", "flash"] },
    [ServerPacket.CraftEvent]: {
        fields: ["id", "duration", "recipeId", "itemId"],
    },
    [ServerPacket.PlaceStructureResult]: {
        fields: ["allowed", "x", "y", "rotation"],
    },
    [ServerPacket.DropItem]: {
        fields: ["id", "objectId", "itemId", "x", "y"],
    },
    [ServerPacket.UpdateObjectHealth]: { fields: ["id", "health", "maxHealth"] },
    [ServerPacket.Leaderboard]: { fields: ["entries"] },
    [ServerPacket.SetStructureState]: { fields: ["id", "states"] },
    [ServerPacket.EatEvent]: { fields: ["id", "duration"] },
    [ServerPacket.SetTimeOfDay]: { fields: ["period"] },
    [ServerPacket.FreecamMode]: { fields: ["enabled"] },
    [ServerPacket.UnloadGround]: { fields: ["groundData"] },
    [ServerPacket.AdminMapYaml]: { fields: ["yaml", "saved", "path"] },
    [ServerPacket.LoadDecorations]: { fields: ["decorations"] },
    [ServerPacket.UnloadDecorations]: { fields: ["decorations"] },
    [ServerPacket.UpdateFlags]: { fields: ["flags"] },
    [ServerPacket.CommandRegistry]: { fields: ["commands"] },
    [ServerPacket.CommandResult]: { fields: ["message", "ok"] },
    [ServerPacket.CreativeMode]: {
        fields: ["enabled", "godmode", "speed", "instakill"],
    },
    [ServerPacket.SetWorldSize]: { fields: ["worldTiles"] },
    [ServerPacket.SetPlayerVisual]: { fields: ["id", "ghosted"] },
    [ServerPacket.UpdateItemLocks]: { fields: ["locks"] },
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
    [ClientPacket.CraftItem]: { fields: ["recipeId"] },
    [ClientPacket.ChatMessage]: { fields: ["message"] },
    [ClientPacket.CursorSlot]: { fields: ["slot", "mode"] },
    [ClientPacket.Block]: { fields: ["stop"] },
    [ClientPacket.PlaceStructure]: { fields: [] },
    [ClientPacket.SetStructurePlacement]: {
        fields: ["rotation", "x", "y"],
    },
    [ClientPacket.ViewBounds]: {
        fields: ["minX", "minY", "maxX", "maxY", "overview"],
    },
    [ClientPacket.AdminPlace]: {
        fields: [
            "kind",
            "typeId",
            "x",
            "y",
            "rotation",
            "variant",
            "w",
            "h",
            "scale",
        ],
    },
    [ClientPacket.AdminDeleteAt]: { fields: ["x", "y", "kind"] },
    [ClientPacket.AdminSetAnimalsFrozen]: { fields: ["frozen"] },
    [ClientPacket.AdminKillAnimals]: { fields: [] },
    [ClientPacket.AdminStrokeBegin]: { fields: [] },
    [ClientPacket.AdminStrokeEnd]: { fields: [] },
    [ClientPacket.AdminUndo]: { fields: [] },
    [ClientPacket.AdminRedo]: { fields: [] },
    [ClientPacket.AdminSaveMap]: { fields: [] },
    [ClientPacket.AdminDownloadMap]: { fields: [] },
    [ClientPacket.AdminNewMap]: { fields: ["worldTiles"] },
    [ClientPacket.AdminImportMap]: { fields: ["yaml"] },
    [ClientPacket.ClientReady]: { fields: [] },
    [ClientPacket.ExitFreecamAt]: { fields: ["x", "y"] },
    [ClientPacket.FreecamCursor]: { fields: ["x", "y"] },
    [ClientPacket.AdminSetGhostVisible]: { fields: ["visible"] },
    [ClientPacket.CreativeGive]: { fields: ["itemId", "count"] },
    [ClientPacket.CreativeSetGodmode]: { fields: ["enabled"] },
    [ClientPacket.CreativeSetSpeed]: { fields: ["speed"] },
    [ClientPacket.CreativeSetInstakill]: { fields: ["enabled"] },
    [ClientPacket.CreativeGiveToCursor]: { fields: ["itemId", "count"] },
    [ClientPacket.CreativeVoid]: { fields: ["slot"] },
    [ClientPacket.CreativeClearInventory]: { fields: [] },
    [ClientPacket.CreativeGiveKit]: { fields: ["kitId"] },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
const isSafeInteger = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value);
const isBoolean = (value: unknown): value is boolean =>
    typeof value === "boolean";
const hasSafeInteger = (value: Record<string, unknown>, key: string) =>
    isSafeInteger(value[key]);

/** Establishes safe wire values before authoritative handlers run. */
export const ClientPacketGuards = {
    [ClientPacket.Rotation]: (value: unknown): value is ClientPacket.Rotation =>
        isRecord(value) &&
        isFiniteNumber(value.rotation) &&
        Math.abs(value.rotation) <= 360,
    [ClientPacket.Movement]: (value: unknown): value is ClientPacket.Movement =>
        isRecord(value) &&
        isSafeInteger(value.direction) &&
        [1, 2, 3, 5, 6, 7, 9, 10, 11].includes(value.direction),
    [ClientPacket.Attack]: (value: unknown): value is ClientPacket.Attack =>
        isRecord(value) && isBoolean(value.stop),
    [ClientPacket.SelectItem]: (value: unknown): value is ClientPacket.SelectItem =>
        isRecord(value) &&
        isSafeInteger(value.slot) &&
        value.slot >= 0 &&
        value.slot <= 255,
    [ClientPacket.MoveSlot]: (value: unknown): value is ClientPacket.MoveSlot =>
        isRecord(value) &&
        isSafeInteger(value.from) &&
        value.from >= 0 &&
        value.from <= 255 &&
        isSafeInteger(value.to) &&
        value.to >= -1 &&
        value.to <= 255,
    [ClientPacket.CraftItem]: (value: unknown): value is ClientPacket.CraftItem =>
        isRecord(value) && isSafeInteger(value.recipeId) && value.recipeId >= 0,
    [ClientPacket.ChatMessage]: (
        value: unknown
    ): value is ClientPacket.ChatMessage =>
        isRecord(value) &&
        typeof value.message === "string" &&
        value.message.length > 0 &&
        value.message.length <= 256,
    [ClientPacket.CursorSlot]: (value: unknown): value is ClientPacket.CursorSlot =>
        isRecord(value) &&
        isSafeInteger(value.slot) &&
        value.slot >= -1 &&
        value.slot <= 255 &&
        (value.mode === PlaceMode.All ||
            value.mode === PlaceMode.Half ||
            value.mode === PlaceMode.One),
    [ClientPacket.Block]: (value: unknown): value is ClientPacket.Block =>
        isRecord(value) && isBoolean(value.stop),
    [ClientPacket.PlaceStructure]: (
        value: unknown
    ): value is ClientPacket.PlaceStructure =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.SetStructurePlacement]: (
        value: unknown
    ): value is ClientPacket.SetStructurePlacement =>
        isRecord(value) &&
        isSafeInteger(value.rotation) &&
        value.rotation >= 0 &&
        value.rotation <= 3 &&
        hasSafeInteger(value, "x") &&
        hasSafeInteger(value, "y"),
    [ClientPacket.ViewBounds]: (
        value: unknown
    ): value is ClientPacket.ViewBounds =>
        isRecord(value) &&
        isFiniteNumber(value.minX) &&
        isFiniteNumber(value.minY) &&
        isFiniteNumber(value.maxX) &&
        isFiniteNumber(value.maxY) &&
        isBoolean(value.overview) &&
        value.maxX >= value.minX &&
        value.maxY >= value.minY &&
        value.maxX - value.minX <= FREECAM_MAX_VIEW_EXTENT &&
        value.maxY - value.minY <= FREECAM_MAX_VIEW_EXTENT,
    [ClientPacket.AdminPlace]: (
        value: unknown
    ): value is ClientPacket.AdminPlace => {
        if (!isRecord(value)) return false;
        if (
            value.kind !== AdminPlaceKind.Resource &&
            value.kind !== AdminPlaceKind.Structure &&
            value.kind !== AdminPlaceKind.Ground &&
            value.kind !== AdminPlaceKind.Decoration &&
            value.kind !== AdminPlaceKind.Animal
        ) {
            return false;
        }
        if (!isSafeInteger(value.typeId) || value.typeId <= 0) return false;
        if (!isFiniteNumber(value.scale) || value.scale <= 0 || value.scale > 100) {
            return false;
        }

        if (
            value.kind === AdminPlaceKind.Decoration ||
            value.kind === AdminPlaceKind.Animal
        ) {
            return (
                isFiniteNumber(value.x) &&
                value.x >= 0 &&
                value.x <= WORLD_BOUNDS &&
                isFiniteNumber(value.y) &&
                value.y >= 0 &&
                value.y <= WORLD_BOUNDS &&
                isFiniteNumber(value.rotation) &&
                Math.abs(value.rotation) <= 3600 &&
                isSafeInteger(value.variant) &&
                value.variant >= 0 &&
                isSafeInteger(value.w) &&
                value.w === 1 &&
                isSafeInteger(value.h) &&
                value.h === 1
            );
        }

        return (
            isSafeInteger(value.x) &&
            value.x >= 0 &&
            value.x < WORLD_TILES &&
            isSafeInteger(value.y) &&
            value.y >= 0 &&
            value.y < WORLD_TILES &&
            isSafeInteger(value.rotation) &&
            value.rotation >= 0 &&
            value.rotation <= 3 &&
            isSafeInteger(value.variant) &&
            value.variant >= 0 &&
            isSafeInteger(value.w) &&
            value.w >= 1 &&
            value.w <= WORLD_TILES &&
            isSafeInteger(value.h) &&
            value.h >= 1 &&
            value.h <= WORLD_TILES &&
            // Full-world rects are the reserved base floor — place overlays only.
            !(
                value.kind === AdminPlaceKind.Ground &&
                value.w >= WORLD_TILES &&
                value.h >= WORLD_TILES
            )
        );
    },
    [ClientPacket.AdminDeleteAt]: (
        value: unknown
    ): value is ClientPacket.AdminDeleteAt =>
        isRecord(value) &&
        isFiniteNumber(value.x) &&
        value.x >= 0 &&
        value.x <= WORLD_BOUNDS &&
        isFiniteNumber(value.y) &&
        value.y >= 0 &&
        value.y <= WORLD_BOUNDS &&
        (value.kind === AdminPlaceKind.Resource ||
            value.kind === AdminPlaceKind.Structure ||
            value.kind === AdminPlaceKind.Ground ||
            value.kind === AdminPlaceKind.Decoration ||
            value.kind === AdminPlaceKind.Animal),
    [ClientPacket.AdminSetAnimalsFrozen]: (
        value: unknown
    ): value is ClientPacket.AdminSetAnimalsFrozen =>
        isRecord(value) && isBoolean(value.frozen),
    [ClientPacket.AdminKillAnimals]: (
        value: unknown
    ): value is ClientPacket.AdminKillAnimals =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.AdminStrokeBegin]: (
        value: unknown
    ): value is ClientPacket.AdminStrokeBegin =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.AdminStrokeEnd]: (
        value: unknown
    ): value is ClientPacket.AdminStrokeEnd =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.AdminUndo]: (
        value: unknown
    ): value is ClientPacket.AdminUndo =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.AdminRedo]: (
        value: unknown
    ): value is ClientPacket.AdminRedo =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.AdminSaveMap]: (
        value: unknown
    ): value is ClientPacket.AdminSaveMap =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.AdminDownloadMap]: (
        value: unknown
    ): value is ClientPacket.AdminDownloadMap =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.AdminNewMap]: (
        value: unknown
    ): value is ClientPacket.AdminNewMap =>
        isRecord(value) &&
        isSafeInteger(value.worldTiles) &&
        isValidWorldTiles(value.worldTiles),
    [ClientPacket.AdminImportMap]: (
        value: unknown
    ): value is ClientPacket.AdminImportMap =>
        isRecord(value) &&
        typeof value.yaml === "string" &&
        value.yaml.length > 0 &&
        value.yaml.length <= 8_000_000,
    [ClientPacket.ClientReady]: (
        value: unknown
    ): value is ClientPacket.ClientReady =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.ExitFreecamAt]: (
        value: unknown
    ): value is ClientPacket.ExitFreecamAt =>
        isRecord(value) &&
        isFiniteNumber(value.x) &&
        value.x >= 0 &&
        value.x <= WORLD_BOUNDS &&
        isFiniteNumber(value.y) &&
        value.y >= 0 &&
        value.y <= WORLD_BOUNDS,
    [ClientPacket.FreecamCursor]: (
        value: unknown
    ): value is ClientPacket.FreecamCursor =>
        isRecord(value) &&
        isFiniteNumber(value.x) &&
        value.x >= 0 &&
        value.x <= WORLD_BOUNDS &&
        isFiniteNumber(value.y) &&
        value.y >= 0 &&
        value.y <= WORLD_BOUNDS,
    [ClientPacket.AdminSetGhostVisible]: (
        value: unknown
    ): value is ClientPacket.AdminSetGhostVisible =>
        isRecord(value) && isBoolean(value.visible),
    [ClientPacket.CreativeGive]: (
        value: unknown
    ): value is ClientPacket.CreativeGive =>
        isRecord(value) &&
        isSafeInteger(value.itemId) &&
        value.itemId >= 0 &&
        isSafeInteger(value.count) &&
        value.count >= 1 &&
        value.count <= 999,
    [ClientPacket.CreativeSetGodmode]: (
        value: unknown
    ): value is ClientPacket.CreativeSetGodmode =>
        isRecord(value) && isBoolean(value.enabled),
    [ClientPacket.CreativeSetSpeed]: (
        value: unknown
    ): value is ClientPacket.CreativeSetSpeed =>
        isRecord(value) &&
        isFiniteNumber(value.speed) &&
        [0.5, 1, 2, 4].includes(value.speed),
    [ClientPacket.CreativeSetInstakill]: (
        value: unknown
    ): value is ClientPacket.CreativeSetInstakill =>
        isRecord(value) && isBoolean(value.enabled),
    [ClientPacket.CreativeGiveToCursor]: (
        value: unknown
    ): value is ClientPacket.CreativeGiveToCursor =>
        isRecord(value) &&
        isSafeInteger(value.itemId) &&
        value.itemId >= 0 &&
        isSafeInteger(value.count) &&
        value.count >= 1 &&
        value.count <= 999,
    [ClientPacket.CreativeVoid]: (
        value: unknown
    ): value is ClientPacket.CreativeVoid =>
        isRecord(value) &&
        isSafeInteger(value.slot) &&
        value.slot >= -1 &&
        value.slot <= 64,
    [ClientPacket.CreativeClearInventory]: (
        value: unknown
    ): value is ClientPacket.CreativeClearInventory =>
        isRecord(value) && Object.keys(value).length === 0,
    [ClientPacket.CreativeGiveKit]: (
        value: unknown
    ): value is ClientPacket.CreativeGiveKit =>
        isRecord(value) &&
        typeof value.kitId === "string" &&
        value.kitId.length > 0 &&
        value.kitId.length <= 32,
} satisfies PacketGuards<ClientPacketMap>;
