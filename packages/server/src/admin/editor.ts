import {
    AdminPlaceKind,
    ServerPacket,
    type ClientPacket,
} from "@bundu/shared/packet_definitions";
import type { RegistryId } from "@bundu/shared/registry";
import {
    WORLD_TILES,
    worldToTile,
    type TileRot,
} from "@bundu/shared/tiles";
import { getVariantName } from "@bundu/shared/variant_map";
import { Box, Vector } from "sat";
import {
    AnimalData,
    GroundData,
    Physics,
    Spiked,
} from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { GroundTypeConfigs } from "../configs/loaders/ground_types.js";
import { gameRegistries } from "../configs/registries.js";
import type { GameObject, World } from "../engine";
import { System } from "../engine";
import { Ground } from "../game_objects/ground.js";
import { Resource } from "../game_objects/resource.js";
import {
    makeTileEntity,
    tileEntityPhysics,
} from "../game_objects/tile_entity.js";
import { GameEvent, type GameEventMap } from "../systems/event_map.js";
import { canUseEditor } from "./auth.js";
import {
    beginStroke,
    endStroke,
    recordMutation,
    redoStroke,
    trySnapshot,
    undoStroke,
} from "./history.js";
import { exportMapYaml, saveMapYaml, wipeMap } from "./map_io.js";
import { setAnimalsFrozen } from "./state.js";

type GroundPacket = [
    type: number,
    x: number,
    y: number,
    w: number,
    h: number,
];

function inWorldTiles(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < WORLD_TILES && y < WORLD_TILES;
}

/** Normalize + clamp a ground rect to the world; null if empty after clamp. */
function clampGroundRect(
    x: number,
    y: number,
    w: number,
    h: number
): { x: number; y: number; w: number; h: number } | null {
    let x0 = x;
    let y0 = y;
    let x1 = x + w - 1;
    let y1 = y + h - 1;
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    x0 = Math.max(0, Math.min(WORLD_TILES - 1, x0));
    y0 = Math.max(0, Math.min(WORLD_TILES - 1, y0));
    x1 = Math.max(0, Math.min(WORLD_TILES - 1, x1));
    y1 = Math.max(0, Math.min(WORLD_TILES - 1, y1));
    const nw = x1 - x0 + 1;
    const nh = y1 - y0 + 1;
    if (nw < 1 || nh < 1) return null;
    return { x: x0, y: y0, w: nw, h: nh };
}

function tryAddResource(
    world: World,
    id: RegistryId<"resource">,
    tx: number,
    ty: number,
    rot: TileRot,
    variant: string
): GameObject | null {
    const origin = { x: tx, y: ty };
    const tile = makeTileEntity(origin, rot);
    if (!world.context.occupancy.canPlace(tile.occupied)) return null;

    const object = new Resource(
        tileEntityPhysics(origin, rot),
        { id, variant },
        tile
    );
    world.addObject(object);
    return object;
}

function resolveVariantName(variantId: number): string {
    try {
        return getVariantName(variantId) ?? "base";
    } catch {
        return "base";
    }
}

function registryHas(
    name: "resource" | "structure" | "ground_type",
    typeId: number
): boolean {
    try {
        gameRegistries()[name].location(typeId);
        return true;
    } catch {
        return false;
    }
}

/**
 * Freecam map editor: place / delete / freeze animals / kill-all / undo.
 * Kept out of PlayerSystem so admin code stays separable.
 */
export class AdminEditorSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [], 0);
    }

    private historyHost() {
        return {
            world: this.world,
            trigger: this.trigger,
            broadcastGround: (packet: GroundPacket) =>
                this.broadcastGround(packet),
            broadcastUnloadGround: (packet: GroundPacket) =>
                this.broadcastUnloadGround(packet),
        };
    }

    placeStructureAt = (
        playerId: number,
        { structureId, x, y, rotation }: ClientPacket.PlaceStructureAt
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        this.trigger(GameEvent.PlaceStructure, {
            structureId,
            x,
            y,
            rotation,
            resultTo: player,
            placedBy: player,
        });
    };

    adminStrokeBegin = (playerId: number, _packet: ClientPacket.AdminStrokeBegin) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        beginStroke(playerId);
    };

    adminStrokeEnd = (playerId: number, _packet: ClientPacket.AdminStrokeEnd) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        endStroke(playerId);
    };

    adminUndo = (playerId: number, _packet: ClientPacket.AdminUndo) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        undoStroke(playerId, this.historyHost());
    };

    adminRedo = (playerId: number, _packet: ClientPacket.AdminRedo) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        redoStroke(playerId, this.historyHost());
    };

    adminSaveMap = (playerId: number, _packet: ClientPacket.AdminSaveMap) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        const { yaml, path } = saveMapYaml(this.world);
        this.world.context.playerPacketManager.set(
            playerId,
            ServerPacket.AdminMapYaml,
            { yaml, saved: true, path }
        );
    };

    adminDownloadMap = (
        playerId: number,
        _packet: ClientPacket.AdminDownloadMap
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        const yaml = exportMapYaml(this.world);
        this.world.context.playerPacketManager.set(
            playerId,
            ServerPacket.AdminMapYaml,
            { yaml, saved: false, path: "" }
        );
    };

    adminWipeMap = (playerId: number, _packet: ClientPacket.AdminWipeMap) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        wipeMap(
            this.world,
            this.trigger,
            (packet) => this.broadcastGround(packet),
            (packet) => this.broadcastUnloadGround(packet)
        );
    };

    adminPlace = (playerId: number, packet: ClientPacket.AdminPlace) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;

        const rot = packet.rotation as TileRot;
        const variant = resolveVariantName(packet.variant);

        switch (packet.kind) {
            case AdminPlaceKind.Resource: {
                if (!inWorldTiles(packet.x, packet.y)) return;
                if (!registryHas("resource", packet.typeId)) return;
                const created = tryAddResource(
                    this.world,
                    packet.typeId as RegistryId<"resource">,
                    packet.x,
                    packet.y,
                    rot,
                    variant
                );
                if (!created) return;
                const snapshot = trySnapshot(created);
                if (snapshot) {
                    recordMutation(playerId, { kind: "add", snapshot });
                }
                return;
            }
            case AdminPlaceKind.Structure: {
                if (!inWorldTiles(packet.x, packet.y)) return;
                if (!registryHas("structure", packet.typeId)) return;
                this.placeStructureTracked(playerId, player, packet, rot);
                return;
            }
            case AdminPlaceKind.Ground: {
                if (!registryHas("ground_type", packet.typeId)) return;
                const rect = clampGroundRect(
                    packet.x,
                    packet.y,
                    packet.w,
                    packet.h
                );
                if (!rect) return;
                const created = this.placeGround(
                    packet.typeId,
                    rect.x,
                    rect.y,
                    rect.w,
                    rect.h
                );
                const snapshot = trySnapshot(created);
                if (snapshot) {
                    recordMutation(playerId, { kind: "add", snapshot });
                }
                return;
            }
        }
    };

    adminDeleteAt = (
        playerId: number,
        { x, y }: ClientPacket.AdminDeleteAt
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        if (!inWorldTiles(x, y)) return;

        const occupantId = this.world.context.occupancy.get(x, y);
        if (occupantId !== undefined) {
            const object = this.world.getObject(occupantId);
            if (object?.active) {
                const snapshot = trySnapshot(object);
                object.active = false;
                this.trigger(GameEvent.DeleteObject, { object });
                if (snapshot) {
                    recordMutation(playerId, { kind: "remove", snapshot });
                }
            }
            return;
        }

        for (const animal of this.world.query([AnimalData, Physics])) {
            if (!animal.active) continue;
            const pos = animal.get(Physics).position;
            if (worldToTile(pos.x) !== x || worldToTile(pos.y) !== y) continue;
            this.trigger(GameEvent.Kill, { object: animal, source: player });
            return;
        }

        const ground = this.topGroundAt(x, y);
        if (!ground) return;
        const snapshot = trySnapshot(ground);
        const data = ground.get(GroundData);
        const packet: GroundPacket = [
            data.type,
            Math.round(data.collider.pos.x),
            Math.round(data.collider.pos.y),
            Math.round(data.collider.w),
            Math.round(data.collider.h),
        ];
        this.world.removeObject(ground);
        this.broadcastUnloadGround(packet);
        if (snapshot) {
            recordMutation(playerId, { kind: "remove", snapshot });
        }
    };

    adminSetAnimalsFrozen = (
        playerId: number,
        { frozen }: ClientPacket.AdminSetAnimalsFrozen
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        setAnimalsFrozen(frozen);
    };

    adminKillAnimals = (playerId: number, _packet: ClientPacket.AdminKillAnimals) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        for (const animal of this.world.query([AnimalData])) {
            if (!animal.active) continue;
            this.trigger(GameEvent.Kill, { object: animal, source: player });
        }
    };

    private placeStructureTracked(
        playerId: number,
        player: GameObject,
        packet: ClientPacket.AdminPlace,
        rot: TileRot
    ): void {
        const beforeId = this.world.context.occupancy.get(packet.x, packet.y);
        const beforeObject =
            beforeId !== undefined ? this.world.getObject(beforeId) : undefined;
        const beforeSnapshot =
            beforeObject?.active ? trySnapshot(beforeObject) : null;
        const beforeSpiked = beforeObject?.active
            ? Boolean(Spiked.get(beforeObject))
            : false;

        this.trigger(GameEvent.PlaceStructure, {
            structureId: packet.typeId,
            x: packet.x,
            y: packet.y,
            rotation: rot,
            resultTo: player,
            placedBy: player,
        });

        const afterId = this.world.context.occupancy.get(packet.x, packet.y);
        const afterObject =
            afterId !== undefined ? this.world.getObject(afterId) : undefined;
        if (!afterObject?.active) return;

        if (beforeSnapshot && beforeSnapshot.id === afterObject.id) {
            if (!beforeSpiked && Spiked.get(afterObject)) {
                recordMutation(playerId, {
                    kind: "spike",
                    objectId: afterObject.id,
                });
            }
            return;
        }

        if (beforeSnapshot && beforeSnapshot.id !== afterObject.id) {
            recordMutation(playerId, {
                kind: "remove",
                snapshot: beforeSnapshot,
            });
        }

        const added = trySnapshot(afterObject);
        if (added) recordMutation(playerId, { kind: "add", snapshot: added });
    }

    private placeGround(
        typeId: number,
        tx: number,
        ty: number,
        tw: number,
        th: number
    ): GameObject {
        const config = GroundTypeConfigs.get(typeId);
        const packet: GroundPacket = [typeId, tx, ty, tw, th];
        const object = new Ground({
            collider: new Box(new Vector(tx, ty), tw, th),
            type: typeId,
            speedMultiplier: config.speed_multiplier,
            createPacket() {
                return packet;
            },
        });
        this.world.addObject(object);
        this.broadcastGround(packet);
        return object;
    }

    /** Topmost editable ground covering a tile (skips the world base floor). */
    private topGroundAt(tx: number, ty: number): GameObject | undefined {
        const grounds = this.world.query([GroundData]);
        for (let i = grounds.length - 1; i >= 0; i--) {
            const ground = grounds[i];
            if (!ground?.active) continue;
            const data = ground.get(GroundData);
            const { pos, w, h } = data.collider;
            if (w >= WORLD_TILES && h >= WORLD_TILES) continue;
            if (tx < pos.x || ty < pos.y || tx >= pos.x + w || ty >= pos.y + h) {
                continue;
            }
            return ground;
        }
        return undefined;
    }

    private broadcastGround(packet: GroundPacket) {
        this.broadcastGroundPacket(ServerPacket.LoadGround, packet);
    }

    private broadcastUnloadGround(packet: GroundPacket) {
        this.broadcastGroundPacket(ServerPacket.UnloadGround, packet);
    }

    private broadcastGroundPacket(
        id: typeof ServerPacket.LoadGround | typeof ServerPacket.UnloadGround,
        packet: GroundPacket
    ) {
        const { playerPacketManager, socketManager } = this.world.context;
        for (const viewer of this.world.query([PlayerData])) {
            if (!socketManager.getSocket(viewer.id)) continue;
            playerPacketManager.add(viewer.id, id, {
                groundData: [packet],
            });
        }
    }
}
