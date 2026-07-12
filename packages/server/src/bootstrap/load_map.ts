import { random } from "@bundu/shared";
import { getNumericId } from "@bundu/shared/id_map";
import {
    WORLD_TILES,
    type TileRot,
} from "@bundu/shared/tiles";
import { Box, Vector } from "sat";
import type { World } from "../engine";
import { Ground } from "../game_objects/ground";
import { Resource } from "../game_objects/resource";
import {
    makeTileEntity,
    tileEntityPhysics,
} from "../game_objects/tile_entity";
import { GameEvent } from "../systems/event_map";
import type { PlayerSystem } from "../systems/player";

const TEST_MAP_RESOURCE_COUNT = 450;
const TEST_MAP_BORDER_PADDING_TILES = 3;

const TEST_MAP_RESOURCE_IDS: string[] = [
    "forest_tree",
    "pine_tree",
    "pine_tree_snow",
    "savanah_tree",
    "stone",
    "gold",
    "diamond",
    "amethyst",
];

function getRequiredNumericId(id: string) {
    const numericId = getNumericId(id);
    if (typeof numericId !== "number") {
        throw new Error(`Missing numeric id for ${id}`);
    }
    return numericId;
}

function tryAddResource(
    world: World,
    id: string,
    tx: number,
    ty: number,
    rot: TileRot = 0
): boolean {
    const origin = { x: tx, y: ty };
    const tile = makeTileEntity(origin, rot);
    if (!world.context.occupancy.canPlace(tile.occupied)) return false;

    world.addObject(
        new Resource(
            tileEntityPhysics(origin, rot),
            { id: getRequiredNumericId(id), variant: "base" },
            tile
        )
    );
    return true;
}

/** Procedural test map + starter structure placement. */
export function loadMap(world: World, playerSystem: PlayerSystem) {
    // Ground AABB in tile coordinates (client scales by TILE_SIZE).
    world.addObject(
        new Ground({
            collider: new Box(new Vector(0, 0), WORLD_TILES, WORLD_TILES),
            type: 1,
            speedMultiplier: 1,
            createPacket() {
                return [1, 0, 0, WORLD_TILES, WORLD_TILES];
            },
        })
    );

    for (let t = 0; t < WORLD_TILES; t++) {
        tryAddResource(world, "stone_barrier", t, 0);
        tryAddResource(world, "stone_barrier", t, WORLD_TILES - 1);
        tryAddResource(world, "stone_barrier", 0, t);
        tryAddResource(world, "stone_barrier", WORLD_TILES - 1, t);
    }

    let placed = 0;
    let attempts = 0;
    const maxAttempts = TEST_MAP_RESOURCE_COUNT * 8;
    while (
        placed < TEST_MAP_RESOURCE_COUNT &&
        attempts < maxAttempts
    ) {
        attempts++;
        const id = random.choice(TEST_MAP_RESOURCE_IDS);
        const tx = random.integer(
            TEST_MAP_BORDER_PADDING_TILES,
            WORLD_TILES - 1 - TEST_MAP_BORDER_PADDING_TILES
        );
        const ty = random.integer(
            TEST_MAP_BORDER_PADDING_TILES,
            WORLD_TILES - 1 - TEST_MAP_BORDER_PADDING_TILES
        );
        const rot = random.integer(0, 3) as TileRot;
        if (tryAddResource(world, id, tx, ty, rot)) placed++;
    }

    playerSystem.trigger(GameEvent.PlaceStructure, {
        structureId: 2,
        x: 77,
        y: 75,
        rotation: 0,
    });
}
