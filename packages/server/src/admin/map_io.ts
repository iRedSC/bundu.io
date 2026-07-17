import fs from "node:fs";
import path from "node:path";
import { WORLD_TILES } from "@bundu/shared/tiles";
import { Box, Vector } from "sat";
import {
    AnimalData,
    Door,
    GroundData,
    GroundItemData,
    Physics,
    ResourceData,
    Spiked,
    TileEntity,
    Type,
} from "../components/base.js";
import { GroundTypeConfigs } from "../configs/loaders/ground_types.js";
import { gameRegistries } from "../configs/registries.js";
import type { World } from "../engine";
import { Ground } from "../game_objects/ground.js";
import { Resource } from "../game_objects/resource.js";
import { Structure } from "../game_objects/structure.js";
import { GameEvent, type GameEventMap } from "../systems/event_map.js";
import { clearEditorHistory } from "./history.js";

const defaultFilename = path.resolve(
    import.meta.dir,
    "../../../../.cache/editor-map.yml"
);

type GroundPacket = [
    type: number,
    x: number,
    y: number,
    w: number,
    h: number,
];

type Trigger = <T extends keyof GameEventMap>(
    event: T,
    data: GameEventMap[T]
) => void;

export function editorMapPath(): string {
    return process.env.BUNDU_EDITOR_MAP ?? defaultFilename;
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
    const groundItems: string[] = [];
    const resourceItems: string[] = [];
    const structureItems: string[] = [];

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
        groundItems.push(
            [
                "  -",
                ...yamlFields(
                    [
                        ["type", type],
                        ["x", x],
                        ["y", y],
                        ["w", w],
                        ["h", h],
                    ],
                    "    "
                ),
            ].join("\n")
        );
    }

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

    return [
        "format: 1",
        `base_ground: ${yamlScalar(baseGround)}`,
        "ground:",
        groundItems.length > 0 ? groundItems.join("\n") : "  []",
        "resources:",
        resourceItems.length > 0 ? resourceItems.join("\n") : "  []",
        "structures:",
        structureItems.length > 0 ? structureItems.join("\n") : "  []",
        "",
    ].join("\n");
}

export function saveMapYaml(world: World): { yaml: string; path: string } {
    const yaml = exportMapYaml(world);
    const target = editorMapPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, yaml);
    fs.renameSync(temporary, target);
    return { yaml, path: target };
}

/**
 * Remove placeables and overlays; restore a full-world base ground floor.
 * Players are left alone. Clears admin undo history for every player.
 */
export function wipeMap(
    world: World,
    trigger: Trigger,
    broadcastGround: (packet: GroundPacket) => void,
    broadcastUnloadGround: (packet: GroundPacket) => void
): void {
    for (const object of [...world.query([GroundData])]) {
        if (!object.active) continue;
        const data = object.get(GroundData);
        const packet: GroundPacket = [
            data.type,
            Math.round(data.collider.pos.x),
            Math.round(data.collider.pos.y),
            Math.round(data.collider.w),
            Math.round(data.collider.h),
        ];
        world.removeObject(object);
        broadcastUnloadGround(packet);
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

    const registries = gameRegistries();
    const oceanId = registries.ground_type.resolve("ocean", "bundu");
    const config = GroundTypeConfigs.get(oceanId);
    const packet: GroundPacket = [oceanId, 0, 0, WORLD_TILES, WORLD_TILES];
    world.addObject(
        new Ground({
            collider: new Box(new Vector(0, 0), WORLD_TILES, WORLD_TILES),
            type: oceanId,
            speedMultiplier: config.speed_multiplier,
            createPacket() {
                return packet;
            },
        })
    );
    broadcastGround(packet);

    for (const object of world.objects.values()) {
        clearEditorHistory(object.id);
    }
}
