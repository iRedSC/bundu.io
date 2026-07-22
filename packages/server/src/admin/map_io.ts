import fs from "node:fs";
import path from "node:path";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import {
    DEFAULT_WORLD_TILES,
    isValidWorldTiles,
    MAX_WORLD_TILES,
    MIN_WORLD_TILES,
    setWorldTiles,
    WORLD_BOUNDS,
    WORLD_TILES,
    type TileRot,
} from "@bundu/shared/tiles";
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
import { FreecamGhostData } from "../components/freecam_ghost.js";
import { PlayerData } from "../components/player.js";
import {
    BuildingConfigs,
    occupancyLayerForClass,
} from "../configs/loaders/buildings.js";
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
import { clearGroundIndex } from "../systems/ground_index.js";
import { groundWire } from "../systems/ground_wire.js";
import { decorationWire } from "../systems/decoration_wire.js";
import { clearEditorHistory } from "./history.js";

const mapsRoot = path.resolve(import.meta.dir, "../../../../maps");
const editorFilename = path.join(mapsRoot, "editor-map.yml");
const defaultMapFilename = path.join(mapsRoot, "default-map.yml");
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
    if (!raw) return editorFilename;
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

/** Tracked fallback map used when no freecam save exists. */
export function defaultMapPath(): string {
    return defaultMapFilename;
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
        `world_tiles: ${WORLD_TILES}`,
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
    applyWorldSize(world, DEFAULT_WORLD_TILES);
    addBaseGround(world, "ocean");
}

/** Resize live playable bounds + spatial index; clamp players into the new box. */
export function applyWorldSize(world: World, worldTiles: number): void {
    setWorldTiles(worldTiles);
    world.context.quadtree.resizeBounds([
        { x: 0, y: 0 },
        { x: WORLD_BOUNDS, y: WORLD_BOUNDS },
    ]);
    clearGroundIndex();
    for (const object of world.query([Physics])) {
        if (!object.active) continue;
        const physics = object.get(Physics);
        physics.position.x = Math.min(
            Math.max(physics.position.x, 0),
            WORLD_BOUNDS
        );
        physics.position.y = Math.min(
            Math.max(physics.position.y, 0),
            WORLD_BOUNDS
        );
        // Ghosts are not in the AOI quadtree.
        if (PlayerData.get(object) && !FreecamGhostData.get(object)) {
            world.context.quadtree.insert(object.id, physics.position);
        }
    }
}

function addBaseGround(world: World, typeRef: string): Ground {
    const registries = gameRegistries();
    const typeId = registries.ground_type.resolve(typeRef, "bundu");
    const object = new Ground({
        collider: new Box(new Vector(0, 0), WORLD_TILES, WORLD_TILES),
        type: typeId,
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
 * Load order: freecam `editor-map.yml` → tracked `default-map.yml` → blank ocean.
 * Migrates a legacy `.cache/editor-map.yml` once if the editor path is empty.
 * Safe to call once at boot on an empty world.
 */
export function loadEditorMapOrBlank(world: World): void {
    const editor = editorMapPath();
    if (!fs.existsSync(editor) && fs.existsSync(legacyCacheFilename)) {
        fs.mkdirSync(path.dirname(editor), { recursive: true });
        fs.copyFileSync(legacyCacheFilename, editor);
        console.info(`[map] migrated ${legacyCacheFilename} -> ${editor}`);
    }

    const target = fs.existsSync(editor)
        ? editor
        : fs.existsSync(defaultMapFilename)
          ? defaultMapFilename
          : null;

    if (!target) {
        loadBlankMap(world);
        console.info(
            `[map] no editor or default map; loaded blank (looked for ${editor})`
        );
        return;
    }

    const yaml = fs.readFileSync(target, "utf8");
    importMapYaml(world, yaml);
    console.info(`[map] loaded ${target}`);
}

function parseMapRoot(yaml: string): Record<string, unknown> {
    const root = asRecord(Bun.YAML.parse(yaml), "map");
    if (root.format !== 1) {
        throw new Error(`map.format: unsupported ${String(root.format)}`);
    }
    return root;
}

function worldTilesFromRoot(root: Record<string, unknown>): number {
    if (root.world_tiles === undefined || root.world_tiles === null) {
        return DEFAULT_WORLD_TILES;
    }
    const tiles = asNumber(root.world_tiles, "map.world_tiles");
    if (!isValidWorldTiles(tiles)) {
        throw new Error(
            `map.world_tiles: expected integer ${MIN_WORLD_TILES}..${MAX_WORLD_TILES} (got ${tiles})`
        );
    }
    return tiles;
}

/** Read `world_tiles` from editor YAML (defaults to {@link DEFAULT_WORLD_TILES}). */
export function worldTilesFromMapYaml(yaml: string): number {
    return worldTilesFromRoot(parseMapRoot(yaml));
}

/** Populate an empty world from editor YAML (inverse of `exportMapYaml`). */
export function importMapYaml(world: World, yaml: string): void {
    const root = parseMapRoot(yaml);
    applyWorldSize(world, worldTilesFromRoot(root));

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
    world.addObject(
        new Ground({
            collider: new Box(new Vector(x, y), w, h),
            type: typeId,
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

type MapClearBroadcasts = {
    broadcastGround: (packet: ServerPacket.GroundWire) => void;
    broadcastUnloadGround: (packet: ServerPacket.GroundWire) => void;
    broadcastDecoration: (packet: ServerPacket.DecorationWire) => void;
    broadcastUnloadDecoration: (packet: ServerPacket.DecorationWire) => void;
    broadcastWorldSize: (worldTiles: number) => void;
};

/** Remove placeables / overlays and clear editor undo history. Players stay. */
function clearMapContents(
    world: World,
    trigger: Trigger,
    broadcasts: Pick<
        MapClearBroadcasts,
        "broadcastUnloadGround" | "broadcastUnloadDecoration"
    >
): void {
    for (const object of [...world.query([GroundData])]) {
        if (!object.active) continue;
        const packet = groundWire(object);
        world.removeObject(object);
        broadcasts.broadcastUnloadGround(packet);
    }

    for (const object of [...world.query([DecorationData])]) {
        if (!object.active) continue;
        const packet = decorationWire(object);
        world.removeObject(object);
        broadcasts.broadcastUnloadDecoration(packet);
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

    for (const entry of world.objects.values()) {
        clearEditorHistory(entry.id);
    }
}

/**
 * Clear the map and restore a blank ocean floor at `worldTiles`.
 * Players are left alone (clamped into the new bounds).
 */
export function newMap(
    world: World,
    worldTiles: number,
    trigger: Trigger,
    broadcasts: MapClearBroadcasts
): void {
    if (!isValidWorldTiles(worldTiles)) {
        throw new Error(`invalid worldTiles ${worldTiles}`);
    }
    clearMapContents(world, trigger, broadcasts);
    applyWorldSize(world, worldTiles);
    broadcasts.broadcastWorldSize(worldTiles);
    const base = addBaseGround(world, "ocean");
    broadcasts.broadcastGround(groundWire(base));
}

/**
 * Clear the live map and load editor YAML (including optional `world_tiles`).
 * Broadcasts unload of the old map, then ground/decoration loads for the new one.
 */
export function importMapLive(
    world: World,
    yaml: string,
    trigger: Trigger,
    broadcasts: MapClearBroadcasts
): void {
    const root = parseMapRoot(yaml);
    const worldTiles = worldTilesFromRoot(root);
    clearMapContents(world, trigger, broadcasts);
    // importMapYaml applies size + base ground + placeables.
    importMapYaml(world, yaml);
    broadcasts.broadcastWorldSize(worldTiles);

    for (const object of [...world.query([GroundData])]) {
        if (!object.active) continue;
        broadcasts.broadcastGround(groundWire(object));
    }
    for (const object of [...world.query([DecorationData])]) {
        if (!object.active) continue;
        broadcasts.broadcastDecoration(decorationWire(object));
    }
}
