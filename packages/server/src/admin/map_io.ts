import fs from "node:fs";
import path from "node:path";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { WORLD_TILES, type TileRot } from "@bundu/shared/tiles";
import { Box, Vector } from "sat";
import {
    AnimalData,
    DecorationData,
    Door,
    GroundData,
    GroundItemData,
    Physics,
    ResourceData,
    Spiked,
    TileEntity,
    Type,
} from "../components/base.js";
import {
    BuildingConfigs,
    occupancyLayerForClass,
} from "../configs/loaders/buildings.js";
import { GroundTypeConfigs } from "../configs/loaders/ground_types.js";
import { gameRegistries } from "../configs/registries.js";
import type { World } from "../engine";
import { tryAddResource } from "../game_objects/add_resource.js";
import { Decoration } from "../game_objects/decoration.js";
import { Ground } from "../game_objects/ground.js";
import { Resource } from "../game_objects/resource.js";
import { Structure } from "../game_objects/structure.js";
import {
    makeTileEntity,
    tileEntityPhysics,
} from "../game_objects/tile_entity.js";
import { GameEvent, type GameEventMap } from "../systems/event_map.js";
import { groundWire } from "../systems/ground_wire.js";
import { decorationWire } from "../systems/decoration_wire.js";
import { clearEditorHistory } from "./history.js";

const mapsRoot = path.resolve(import.meta.dir, "../../../../maps");
const defaultFilename = path.join(mapsRoot, "editor-map.yml");
const legacyCacheFilename = path.resolve(
    import.meta.dir,
    "../../../../.cache/editor-map.yml"
);

type Trigger = <T extends keyof GameEventMap>(
    event: T,
    data: GameEventMap[T]
) => void;

/**
 * Resolve the editor map write path.
 * Confined under `maps/` — rejects `..` / absolute escapes.
 */
export function editorMapPath(): string {
    const raw = process.env.BUNDU_EDITOR_MAP;
    if (!raw) return defaultFilename;
    const resolved = path.resolve(mapsRoot, raw);
    if (
        resolved !== mapsRoot &&
        !resolved.startsWith(mapsRoot + path.sep)
    ) {
        throw new Error(
            `BUNDU_EDITOR_MAP must resolve under maps/ (got ${raw})`
        );
    }
    return resolved;
}

function shortLocation(location: string): string {
    return location.startsWith("bundu:")
        ? location.slice("bundu:".length)
        : location;
}

function isBaseGround(w: number, h: number): boolean {
    return w >= WORLD_TILES && h >= WORLD_TILES;
}

function yamlScalar(value: string | number | boolean): string {
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (/^[A-Za-z0-9_./-]+$/.test(value)) return value;
    return JSON.stringify(value);
}

function yamlFields(
    entries: [string, string | number | boolean][],
    indent: string
): string[] {
    return entries.map(
        ([key, value]) => `${indent}${key}: ${yamlScalar(value)}`
    );
}

/** Snapshot placeable world state to human-editable YAML. */
export function exportMapYaml(world: World): string {
    const registries = gameRegistries();
    let baseGround = "ocean";
    const groundRows: {
        id: number;
        type: string;
        x: number;
        y: number;
        w: number;
        h: number;
    }[] = [];
    const resourceItems: string[] = [];
    const structureItems: string[] = [];
    const decorationItems: string[] = [];

    for (const object of world.query([GroundData])) {
        if (!object.active) continue;
        const data = object.get(GroundData);
        const type = shortLocation(registries.ground_type.location(data.type));
        const x = Math.round(data.collider.pos.x);
        const y = Math.round(data.collider.pos.y);
        const w = Math.round(data.collider.w);
        const h = Math.round(data.collider.h);
        if (isBaseGround(w, h)) {
            baseGround = type;
            continue;
        }
        groundRows.push({ id: object.id, type, x, y, w, h });
    }

    // Stack order = entity id ascending (higher id paints on top).
    groundRows.sort((a, b) => a.id - b.id);
    const groundItems = groundRows.map((row) =>
        [
            "  -",
            ...yamlFields(
                [
                    ["id", row.id],
                    ["type", row.type],
                    ["x", row.x],
                    ["y", row.y],
                    ["w", row.w],
                    ["h", row.h],
                ],
                "    "
            ),
        ].join("\n")
    );

    for (const object of world.query([ResourceData, Type, TileEntity])) {
        if (!object.active || !(object instanceof Resource)) continue;
        const type = object.get(Type);
        const tile = object.get(TileEntity);
        const id = shortLocation(registries.resource.location(type.id));
        const fields: [string, string | number | boolean][] = [
            ["id", id],
            ["x", tile.origin.x],
            ["y", tile.origin.y],
            ["rot", tile.rot],
        ];
        if (type.variant && type.variant !== "base") {
            fields.push(["variant", type.variant]);
        }
        resourceItems.push(
            ["  -", ...yamlFields(fields, "    ")].join("\n")
        );
    }

    for (const object of world.query([Type, TileEntity, Physics])) {
        if (!object.active || !(object instanceof Structure)) continue;
        const type = object.get(Type);
        const tile = object.get(TileEntity);
        const id = shortLocation(registries.structure.location(type.id));
        const fields: [string, string | number | boolean][] = [
            ["id", id],
            ["x", tile.origin.x],
            ["y", tile.origin.y],
            ["rot", tile.rot],
        ];
        if (type.variant && type.variant !== "base") {
            fields.push(["variant", type.variant]);
        }
        const door = Door.get(object);
        if (door) fields.push(["door_open", door.open]);
        if (Spiked.get(object)) fields.push(["spiked", true]);
        structureItems.push(
            ["  -", ...yamlFields(fields, "    ")].join("\n")
        );
    }

    for (const object of world.query([DecorationData])) {
        if (!object.active || !(object instanceof Decoration)) continue;
        const data = object.get(DecorationData);
        const id = shortLocation(registries.decoration.location(data.type));
        const fields: [string, string | number | boolean][] = [
            ["id", id],
            ["x", roundNice(data.x)],
            ["y", roundNice(data.y)],
            ["rot", roundNice(data.rotation)],
            ["scale", roundNice(data.scale)],
        ];
        decorationItems.push(
            ["  -", ...yamlFields(fields, "    ")].join("\n")
        );
    }

    return [
        "format: 1",
        `base_ground: ${yamlScalar(baseGround)}`,
        "ground:",
        groundItems.length > 0 ? groundItems.join("\n") : "  []",
        "resources:",
        resourceItems.length > 0 ? resourceItems.join("\n") : "  []",
        "structures:",
        structureItems.length > 0 ? structureItems.join("\n") : "  []",
        "decorations:",
        decorationItems.length > 0 ? decorationItems.join("\n") : "  []",
        "",
    ].join("\n");
}

function roundNice(value: number): number {
    return Math.round(value * 1000) / 1000;
}

export function saveMapYaml(world: World): { yaml: string; path: string } {
    const yaml = exportMapYaml(world);
    const target = editorMapPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, yaml);
    fs.renameSync(temporary, target);
    console.info(`[admin] map saved to ${target}`);
    return { yaml, path: target };
}

/** Full-world ocean floor — the blank freecam starting state. */
export function loadBlankMap(world: World): void {
    addBaseGround(world, "ocean");
}

function addBaseGround(world: World, typeRef: string): Ground {
    const registries = gameRegistries();
    const typeId = registries.ground_type.resolve(typeRef, "bundu");
    const config = GroundTypeConfigs.get(typeId);
    const object = new Ground({
        collider: new Box(new Vector(0, 0), WORLD_TILES, WORLD_TILES),
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
    world.addObject(object);
    return object;
}

/**
 * Load `maps/editor-map.yml` when present; otherwise a blank ocean map.
 * Migrates a legacy `.cache/editor-map.yml` once if the new path is empty.
 * Safe to call once at boot on an empty world.
 */
export function loadEditorMapOrBlank(world: World): void {
    const target = editorMapPath();
    if (!fs.existsSync(target) && fs.existsSync(legacyCacheFilename)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(legacyCacheFilename, target);
        console.info(`[map] migrated ${legacyCacheFilename} -> ${target}`);
    }
    if (!fs.existsSync(target)) {
        loadBlankMap(world);
        console.info(`[map] no saved map at ${target}; loaded blank`);
        return;
    }
    const yaml = fs.readFileSync(target, "utf8");
    importMapYaml(world, yaml);
    console.info(`[map] loaded ${target}`);
}

/** Populate an empty world from editor YAML (inverse of `exportMapYaml`). */
export function importMapYaml(world: World, yaml: string): void {
    const root = asRecord(Bun.YAML.parse(yaml), "map");
    if (root.format !== 1) {
        throw new Error(`map.format: unsupported ${String(root.format)}`);
    }

    const baseGround =
        typeof root.base_ground === "string" && root.base_ground
            ? root.base_ground
            : "ocean";
    addBaseGround(world, baseGround);

    const groundRows = asArray(root.ground, "map.ground")
        .map((raw, index) => {
            const row = asRecord(raw, `map.ground[${index}]`);
            return {
                id: asNumber(row.id, `map.ground[${index}].id`),
                type: asString(row.type, `map.ground[${index}].type`),
                x: asNumber(row.x, `map.ground[${index}].x`),
                y: asNumber(row.y, `map.ground[${index}].y`),
                w: asNumber(row.w, `map.ground[${index}].w`),
                h: asNumber(row.h, `map.ground[${index}].h`),
            };
        })
        .sort((a, b) => a.id - b.id);

    const registries = gameRegistries();

    for (const row of groundRows) {
        addGroundOverlay(world, row.type, row.x, row.y, row.w, row.h);
    }

    for (const [index, raw] of asArray(root.resources, "map.resources").entries()) {
        const row = asRecord(raw, `map.resources[${index}]`);
        const id = asString(row.id, `map.resources[${index}].id`);
        const x = asNumber(row.x, `map.resources[${index}].x`);
        const y = asNumber(row.y, `map.resources[${index}].y`);
        const rot = asTileRot(row.rot, `map.resources[${index}].rot`);
        const variant =
            typeof row.variant === "string" && row.variant
                ? row.variant
                : "base";
        const typeId = registries.resource.resolve(id, "bundu");
        if (!tryAddResource(world, typeId, x, y, rot, variant)) {
            console.warn(
                `[map] skipped resource ${id} at ${x},${y} (placement blocked)`
            );
        }
    }

    for (const [index, raw] of asArray(
        root.structures,
        "map.structures"
    ).entries()) {
        const row = asRecord(raw, `map.structures[${index}]`);
        const id = asString(row.id, `map.structures[${index}].id`);
        const x = asNumber(row.x, `map.structures[${index}].x`);
        const y = asNumber(row.y, `map.structures[${index}].y`);
        const rot = asTileRot(row.rot, `map.structures[${index}].rot`);
        const variant =
            typeof row.variant === "string" && row.variant
                ? row.variant
                : "base";
        const doorOpen =
            typeof row.door_open === "boolean" ? row.door_open : false;
        const spiked = row.spiked === true;
        addStructure(world, id, x, y, rot, variant, doorOpen, spiked);
    }

    for (const [index, raw] of asArray(
        root.decorations,
        "map.decorations"
    ).entries()) {
        const row = asRecord(raw, `map.decorations[${index}]`);
        const id = asString(row.id, `map.decorations[${index}].id`);
        const x = asNumber(row.x, `map.decorations[${index}].x`);
        const y = asNumber(row.y, `map.decorations[${index}].y`);
        const rotation = asNumber(row.rot, `map.decorations[${index}].rot`);
        const scale = asNumber(row.scale, `map.decorations[${index}].scale`);
        world.addObject(
            new Decoration({
                type: registries.decoration.resolve(id, "bundu"),
                x,
                y,
                rotation,
                scale,
            })
        );
    }
}

function addGroundOverlay(
    world: World,
    typeRef: string,
    x: number,
    y: number,
    w: number,
    h: number
): void {
    if (isBaseGround(w, h)) return;
    const typeId = gameRegistries().ground_type.resolve(typeRef, "bundu");
    const config = GroundTypeConfigs.get(typeId);
    world.addObject(
        new Ground({
            collider: new Box(new Vector(x, y), w, h),
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
        })
    );
}

function addStructure(
    world: World,
    typeRef: string,
    x: number,
    y: number,
    rot: TileRot,
    variant: string,
    doorOpen: boolean,
    spiked: boolean
): void {
    const typeId = gameRegistries().structure.resolve(typeRef, "bundu");
    const config = BuildingConfigs.get(typeId);
    const origin = { x, y };
    const tile = makeTileEntity(
        origin,
        rot,
        config.placement.blocked,
        occupancyLayerForClass(config.class)
    );
    const object = new Structure(
        tileEntityPhysics(origin, rot),
        { id: typeId, variant },
        tile
    );
    if (spiked) object.add(new Spiked());
    world.addObject(object);
    const door = Door.get(object);
    if (door && doorOpen) {
        door.open = true;
        // PositionSystem.enter occupies; open doors must release.
        world.context.occupancy.release(object.id);
    }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
        throw new Error(`${path}: expected an array`);
    }
    return value;
}

function asString(value: unknown, path: string): string {
    if (typeof value !== "string" || !value) {
        throw new Error(`${path}: expected a non-empty string`);
    }
    return value;
}

function asNumber(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${path}: expected a number`);
    }
    return value;
}

function asTileRot(value: unknown, path: string): TileRot {
    const rot = asNumber(value, path);
    if (!Number.isInteger(rot) || rot < 0 || rot > 3) {
        throw new Error(`${path}: expected tile rotation 0..3`);
    }
    return rot as TileRot;
}

/**
 * Remove placeables and overlays; restore a full-world base ground floor.
 * Players are left alone. Clears admin undo history for every player.
 */
export function wipeMap(
    world: World,
    trigger: Trigger,
    broadcastGround: (packet: ServerPacket.GroundWire) => void,
    broadcastUnloadGround: (packet: ServerPacket.GroundWire) => void,
    _broadcastDecoration: (packet: ServerPacket.DecorationWire) => void,
    broadcastUnloadDecoration: (packet: ServerPacket.DecorationWire) => void
): void {
    for (const object of [...world.query([GroundData])]) {
        if (!object.active) continue;
        const packet = groundWire(object);
        world.removeObject(object);
        broadcastUnloadGround(packet);
    }

    for (const object of [...world.query([DecorationData])]) {
        if (!object.active) continue;
        const packet = decorationWire(object);
        world.removeObject(object);
        broadcastUnloadDecoration(packet);
    }

    const toRemove = [
        ...world.query([ResourceData]),
        ...world.query([Type, TileEntity]),
        ...world.query([AnimalData]),
        ...world.query([GroundItemData]),
    ];
    const seen = new Set<number>();
    for (const object of toRemove) {
        if (!object.active || seen.has(object.id)) continue;
        seen.add(object.id);
        if (
            object instanceof Resource ||
            object instanceof Structure ||
            AnimalData.get(object) ||
            GroundItemData.get(object)
        ) {
            object.active = false;
            trigger(GameEvent.DeleteObject, { object });
        }
    }

    const base = addBaseGround(world, "ocean");
    broadcastGround(groundWire(base));

    for (const entry of world.objects.values()) {
        clearEditorHistory(entry.id);
    }
}
