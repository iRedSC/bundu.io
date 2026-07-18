import {
    AdminPlaceKind,
    ServerPacket,
    type ClientPacket,
} from "@bundu/shared/packet_definitions";
import type { RegistryId } from "@bundu/shared/registry";
import {
    WORLD_BOUNDS,
    WORLD_TILES,
    worldToTile,
    type TileRot,
} from "@bundu/shared/tiles";
import { getVariantName } from "@bundu/shared/variant_map";
import { Box, Vector } from "sat";
import {
    AnimalData,
    DecorationData,
    Physics,
    Spiked,
} from "../components/base.js";
import { PlayerData } from "../components/player.js";
import {
    BuildingConfigs,
    occupancyLayerForClass,
} from "../configs/loaders/buildings.js";
import { GroundTypeConfigs } from "../configs/loaders/ground_types.js";
import { DecorationConfigs } from "../configs/loaders/decorations.js";
import { gameRegistries } from "../configs/registries.js";
import type { GameObject, World } from "../engine";
import { System } from "../engine";
import { tryAddResource } from "../game_objects/add_resource.js";
import { Decoration } from "../game_objects/decoration.js";
import { Ground } from "../game_objects/ground.js";
import { GameEvent, type GameEventMap } from "../systems/event_map.js";
import { topGroundAt } from "../systems/ground_at.js";
import { groundWire } from "../systems/ground_wire.js";
import { decorationWire } from "../systems/decoration_wire.js";
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
    // Full-world rects are the reserved base floor — overlays only.
    if (nw >= WORLD_TILES && nh >= WORLD_TILES) return null;
    return { x: x0, y: y0, w: nw, h: nh };
}

function resolveVariantName(variantId: number): string {
    try {
        return getVariantName(variantId) ?? "base";
    } catch {
        return "base";
    }
}

function registryHas(
    name: "resource" | "structure" | "ground_type" | "decoration",
    typeId: number
): boolean {
    try {
        gameRegistries()[name].location(typeId);
        return true;
    } catch {
        return false;
    }
}

function inWorld(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x <= WORLD_BOUNDS && y <= WORLD_BOUNDS;
}

/** Nearest decoration whose painted radius contains the world point. */
function topDecorationAt(
    world: World,
    x: number,
    y: number
): GameObject | null {
    let best: GameObject | null = null;
    let bestZ = -Infinity;
    let bestId = -1;
    for (const object of world.query([DecorationData])) {
        if (!object.active) continue;
        const data = object.get(DecorationData);
        const config = DecorationConfigs.get(data.type);
        const radius = (config.size * data.scale) / 2;
        const dx = data.x - x;
        const dy = data.y - y;
        if (dx * dx + dy * dy > radius * radius) continue;
        if (config.z > bestZ || (config.z === bestZ && object.id > bestId)) {
            best = object;
            bestZ = config.z;
            bestId = object.id;
        }
    }
    return best;
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
            broadcastGround: (packet: ServerPacket.GroundWire) =>
                this.broadcastGround(packet),
            broadcastUnloadGround: (packet: ServerPacket.GroundWire) =>
                this.broadcastUnloadGround(packet),
            broadcastDecoration: (packet: ServerPacket.DecorationWire) =>
                this.broadcastDecoration(packet),
            broadcastUnloadDecoration: (packet: ServerPacket.DecorationWire) =>
                this.broadcastUnloadDecoration(packet),
        };
    }

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
        const { yaml } = saveMapYaml(this.world);
        this.world.context.playerPacketManager.set(
            playerId,
            ServerPacket.AdminMapYaml,
            { yaml, saved: true, path: "" }
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
            (packet) => this.broadcastUnloadGround(packet),
            (packet) => this.broadcastDecoration(packet),
            (packet) => this.broadcastUnloadDecoration(packet)
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
            case AdminPlaceKind.Decoration: {
                if (!inWorld(packet.x, packet.y)) return;
                if (!registryHas("decoration", packet.typeId)) return;
                const created = this.placeDecoration(
                    packet.typeId,
                    packet.x,
                    packet.y,
                    packet.rotation,
                    packet.scale
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
        if (!inWorld(x, y)) return;

        // Inclusive world bounds can land on WORLD_TILES after floor-division;
        // clamp so edge clicks still hit tile occupants / ground.
        const tx = Math.min(worldToTile(x), WORLD_TILES - 1);
        const ty = Math.min(worldToTile(y), WORLD_TILES - 1);

        const occupantId = this.world.context.occupancy.top(tx, ty);
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
            if (worldToTile(pos.x) !== tx || worldToTile(pos.y) !== ty) continue;
            // DeleteObject — not Kill — so editor removal skips corpses / score.
            animal.active = false;
            this.trigger(GameEvent.DeleteObject, { object: animal });
            return;
        }

        const decoration = topDecorationAt(this.world, x, y);
        if (decoration) {
            const snapshot = trySnapshot(decoration);
            const packet = decorationWire(decoration);
            this.world.removeObject(decoration);
            this.broadcastUnloadDecoration(packet);
            if (snapshot) {
                recordMutation(playerId, { kind: "remove", snapshot });
            }
            return;
        }

        const top = topGroundAt(this.world, tx, ty, { editableOnly: true });
        if (!top) return;
        const ground = this.world.getObject(top.objectId);
        if (!ground?.active) return;
        const snapshot = trySnapshot(ground);
        const packet = groundWire(ground);
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
        setAnimalsFrozen(playerId, frozen);
    };

    adminKillAnimals = (playerId: number, _packet: ClientPacket.AdminKillAnimals) => {
        const player = this.world.getObject(playerId);
        if (!player || !canUseEditor(player)) return;
        for (const animal of this.world.query([AnimalData])) {
            if (!animal.active) continue;
            // Same as wipe / click-delete: remove without corpses or score.
            animal.active = false;
            this.trigger(GameEvent.DeleteObject, { object: animal });
        }
    };

    private placeStructureTracked(
        playerId: number,
        player: GameObject,
        packet: ClientPacket.AdminPlace,
        rot: TileRot
    ): void {
        const layer = occupancyLayerForClass(
            BuildingConfigs.get(packet.typeId).class
        );
        const beforeId = this.world.context.occupancy.get(
            packet.x,
            packet.y,
            layer
        );
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

        const afterId = this.world.context.occupancy.get(
            packet.x,
            packet.y,
            layer
        );
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
        const object = new Ground({
            collider: new Box(new Vector(tx, ty), tw, th),
            type: typeId,
            speedMultiplier: config.speed_multiplier,
            createPacket() {
                return [
                    this.type,
                    this.collider.pos.x,
                    this.collider.pos.y,
                    this.collider.w,
                    this.collider.h,
                ];
            },
        });
        this.world.addObject(object);
        this.broadcastGround(groundWire(object));
        return object;
    }

    private placeDecoration(
        typeId: number,
        x: number,
        y: number,
        rotation: number,
        scale: number
    ): GameObject {
        const object = new Decoration({
            type: typeId,
            x,
            y,
            rotation,
            scale,
        });
        this.world.addObject(object);
        this.broadcastDecoration(decorationWire(object));
        return object;
    }

    private broadcastGround(packet: ServerPacket.GroundWire) {
        this.broadcastGroundPacket(ServerPacket.LoadGround, packet);
    }

    private broadcastUnloadGround(packet: ServerPacket.GroundWire) {
        this.broadcastGroundPacket(ServerPacket.UnloadGround, packet);
    }

    private broadcastGroundPacket(
        id: typeof ServerPacket.LoadGround | typeof ServerPacket.UnloadGround,
        packet: ServerPacket.GroundWire
    ) {
        const { playerPacketManager, socketManager } = this.world.context;
        for (const viewer of this.world.query([PlayerData])) {
            if (!socketManager.getSocket(viewer.id)) continue;
            playerPacketManager.add(viewer.id, id, {
                groundData: [packet],
            });
        }
    }

    private broadcastDecoration(packet: ServerPacket.DecorationWire) {
        this.broadcastDecorationPacket(ServerPacket.LoadDecorations, packet);
    }

    private broadcastUnloadDecoration(packet: ServerPacket.DecorationWire) {
        this.broadcastDecorationPacket(ServerPacket.UnloadDecorations, packet);
    }

    private broadcastDecorationPacket(
        id:
            | typeof ServerPacket.LoadDecorations
            | typeof ServerPacket.UnloadDecorations,
        packet: ServerPacket.DecorationWire
    ) {
        const { playerPacketManager, socketManager } = this.world.context;
        for (const viewer of this.world.query([PlayerData])) {
            if (!socketManager.getSocket(viewer.id)) continue;
            playerPacketManager.add(viewer.id, id, {
                decorations: [packet],
            });
        }
    }
}
