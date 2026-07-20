import { random } from "@bundu/shared";
import {
    TILE_SIZE,
    WORLD_TILES,
    worldToTile,
    type TileRot,
} from "@bundu/shared/tiles";
import { Box, Circle, Vector } from "sat";
import type { World } from "../engine";
import { tryAddResource } from "../game_objects/add_resource";
import { Ground } from "../game_objects/ground";
import { Animal } from "../game_objects/animal";
import { AnimalConfigs } from "../configs/loaders/animals";
import { GameEvent } from "../systems/event_map";
import type { PlayerSystem } from "../systems/player";
import { gameplayConfig } from "../configs/gameplay";
import { gameRegistries } from "../configs/registries";

/** Procedural test map + starter structure placement. */
export function loadMap(world: World, playerSystem: PlayerSystem) {
    const worldgen = gameplayConfig().worldgen;
    const registries = gameRegistries();
    const groundType = registries.ground_type.resolve("ocean", "bundu");
    const barrier = registries.resource.resolve("stone_barrier", "bundu");
    const resourceTypes = registries.resource.resolveSet(
        worldgen.resources,
        "bundu",
        "gameplay.worldgen.resources"
    );
    const entityTypes = registries.entity_type.resolveSet(
        worldgen.animals,
        "bundu",
        "gameplay.worldgen.animals"
    );
    // Ground AABB in tile coordinates (client scales by TILE_SIZE).
    world.addObject(
        new Ground({
            collider: new Box(new Vector(0, 0), WORLD_TILES, WORLD_TILES),
            type: groundType,
            createPacket() {
                return [groundType, 0, 0, WORLD_TILES, WORLD_TILES];
            },
        })
    );

    for (let t = 0; t < WORLD_TILES; t++) {
        tryAddResource(world, barrier, t, 0);
        tryAddResource(world, barrier, t, WORLD_TILES - 1);
        tryAddResource(world, barrier, 0, t);
        tryAddResource(world, barrier, WORLD_TILES - 1, t);
    }

    let placed = 0;
    let attempts = 0;
    const maxAttempts =
        worldgen.resourceCount * worldgen.placementAttemptMultiplier;
    while (
        placed < worldgen.resourceCount &&
        attempts < maxAttempts
    ) {
        attempts++;
        const id = random.choice([...resourceTypes]);
        const tx = random.integer(
            worldgen.borderPaddingTiles,
            WORLD_TILES - 1 - worldgen.borderPaddingTiles
        );
        const ty = random.integer(
            worldgen.borderPaddingTiles,
            WORLD_TILES - 1 - worldgen.borderPaddingTiles
        );
        const rot = random.integer(0, 3) as TileRot;
        if (tryAddResource(world, id, tx, ty, rot)) placed++;
    }

    for (const typeId of entityTypes) {
        const animal = AnimalConfigs.get(typeId);
        let spawned = 0;
        let spawnAttempts = 0;
        while (
            spawned < animal.spawn_count &&
            spawnAttempts++ <
                animal.spawn_count * worldgen.placementAttemptMultiplier
        ) {
            const position = new Vector(
                random.integer(
                    worldgen.borderPaddingTiles * TILE_SIZE,
                    (WORLD_TILES - worldgen.borderPaddingTiles) * TILE_SIZE
                ),
                random.integer(
                    worldgen.borderPaddingTiles * TILE_SIZE,
                    (WORLD_TILES - worldgen.borderPaddingTiles) * TILE_SIZE
                )
            );
            if (
                world.context.occupancy.get(
                    worldToTile(position.x),
                    worldToTile(position.y),
                    "structure"
                ) !== undefined
            ) {
                continue;
            }
            world.addObject(new Animal(
                { id: typeId, variant: "base" },
                {
                    position,
                    collider: new Circle(position, TILE_SIZE / 2),
                    collisionRadius: TILE_SIZE / 2,
                    rotation: 0,
                    speed: animal.passiveSpeed,
                }
            ));
            spawned++;
        }
    }

    const starter = worldgen.starterStructure;
    playerSystem.trigger(GameEvent.PlaceStructure, {
        structureId: registries.structure.resolve(starter.id, "bundu"),
        x: starter.x,
        y: starter.y,
        rotation: starter.rotation as TileRot,
    });
}
