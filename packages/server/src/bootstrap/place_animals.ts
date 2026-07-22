import { WORLD_TILES } from "@bundu/shared/tiles";
import { gameplayConfig } from "../configs/gameplay.js";
import { AnimalConfigs } from "../configs/loaders/animals.js";
import { gameRegistries } from "../configs/registries.js";
import type { World } from "../engine";
import { tryAddAnimal } from "../game_objects/add_animal.js";

/**
 * Seed animals from gameplay.worldgen after the map is loaded.
 * Per-species budget is `spawn_count`; tiles must match `spawn.ground`.
 */
export function placeAnimals(world: World): void {
    const {
        animals,
        borderPaddingTiles: pad,
        placementAttemptMultiplier,
    } = gameplayConfig().worldgen;
    const min = pad;
    const max = WORLD_TILES - pad;
    if (max <= min) return;

    const span = max - min;
    const registries = gameRegistries();
    let placed = 0;

    for (const animalRef of animals) {
        const typeId = registries.entity_type.resolve(animalRef, "bundu");
        const config = AnimalConfigs.get(typeId);
        const count = config.spawn_count;
        if (count <= 0 || config.spawn.ground.length === 0) continue;

        const attempts = Math.max(
            count,
            Math.ceil(count * placementAttemptMultiplier)
        );
        let remaining = count;
        for (let i = 0; i < attempts && remaining > 0; i++) {
            const tx = min + Math.floor(Math.random() * span);
            const ty = min + Math.floor(Math.random() * span);
            if (!tryAddAnimal(world, typeId, tx, ty)) continue;
            remaining--;
            placed++;
        }
    }

    if (placed > 0) {
        console.info(`[worldgen] placed ${placed} animals`);
    }
}
