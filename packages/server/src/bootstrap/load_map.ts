import { random } from "@bundu/shared";
import { getNumericId } from "@bundu/shared/id_map";
import { Box, Circle, Vector } from "sat";
import type { World } from "../engine";
import { Ground } from "../game_objects/ground";
import { Resource } from "../game_objects/resource";
import { GameEvent } from "../systems/event_map";
import type { PlayerSystem } from "../systems/player";
import { WORLD_BOUNDS } from "../systems/position";

const TEST_MAP_SIZE = WORLD_BOUNDS;
const TEST_MAP_BORDER_PADDING = 300;
const TEST_MAP_RESOURCE_COUNT = 450;

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

function addResource(
    world: World,
    id: string,
    x: number,
    y: number,
    collisionRadius: number,
    rotation = 0
) {
    const position = new Vector(x, y);
    world.addObject(
        new Resource(
            {
                position,
                collider: new Circle(position, collisionRadius),
                rotation,
                collisionRadius,
                solid: true,
                speed: 0,
            },
            { id: getRequiredNumericId(id), variant: 0 }
        )
    );
}

/** Procedural test map + starter structure placement. */
export function loadMap(world: World, playerSystem: PlayerSystem) {
    const origin = new Vector(0, 0);
    world.addObject(
        new Ground({
            collider: new Box(origin, TEST_MAP_SIZE, TEST_MAP_SIZE),
            type: 1,
            speedMultiplier: 1,
            createPacket() {
                return [1, 0, 0, TEST_MAP_SIZE, TEST_MAP_SIZE];
            },
        })
    );

    const borderSize = 56;
    const borderStep = borderSize * 2;
    for (let pos = 0; pos <= TEST_MAP_SIZE; pos += borderStep) {
        addResource(world, "stone_barrier", pos, 0, borderSize);
        addResource(world, "stone_barrier", pos, TEST_MAP_SIZE, borderSize);
        addResource(world, "stone_barrier", 0, pos, borderSize);
        addResource(world, "stone_barrier", TEST_MAP_SIZE, pos, borderSize);
    }

    for (let i = 0; i < TEST_MAP_RESOURCE_COUNT; i++) {
        const id = random.choice(TEST_MAP_RESOURCE_IDS);
        addResource(
            world,
            id,
            random.integer(
                TEST_MAP_BORDER_PADDING,
                TEST_MAP_SIZE - TEST_MAP_BORDER_PADDING
            ),
            random.integer(
                TEST_MAP_BORDER_PADDING,
                TEST_MAP_SIZE - TEST_MAP_BORDER_PADDING
            ),
            random.integer(30, 70),
            random.integer(0, 360)
        );
    }

    playerSystem.trigger(GameEvent.PlaceStructure, {
        structureId: 2,
        x: 7700,
        y: 7500,
        rotation: 0,
    });
}
