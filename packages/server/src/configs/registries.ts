import {
    REGISTRY_NAMES,
    Registry,
    registrySetProjection,
    type RegistryName,
    type RegistrySetProjection,
} from "@bundu/shared/registry";
import { packs, type SourcedRecord } from "./packs.js";

export type RegistrySources = {
    [K in RegistryName]: Map<string, SourcedRecord>;
};

export type GameRegistries = {
    [K in RegistryName]: Registry<K>;
};

let currentSources: RegistrySources | undefined;
let currentRegistries: GameRegistries | undefined;

function definitionsOrRecords(resource: string): Map<string, SourcedRecord> {
    const definitions = packs.registryDefinitions(resource);
    return definitions.size > 0 ? definitions : packs.registryRecords(resource);
}

function applyTags<K extends RegistryName>(registry: Registry<K>): void {
    for (const [tag, sources] of packs.registryTags(registry.name)) {
        for (const source of sources) {
            const method = source.replace ? "defineTag" : "appendTag";
            registry[method](
                tag,
                source.values,
                source.namespace,
                source.category
            );
        }
    }
    registry.validateTags();
}

export function loadRegistries(): GameRegistries {
    const sources: RegistrySources = {
        item: definitionsOrRecords("items"),
        structure: definitionsOrRecords("buildings"),
        resource: definitionsOrRecords("resources"),
        entity_type: definitionsOrRecords("entities"),
        ground_type: definitionsOrRecords("ground_types"),
        decoration: definitionsOrRecords("decorations"),
        recipe: definitionsOrRecords("recipes"),
        loot_table: definitionsOrRecords("loot_tables"),
    };

    const registries = Object.fromEntries(
        REGISTRY_NAMES.map((name) => [name, new Registry(name, sources[name].keys())])
    ) as GameRegistries;
    for (const name of REGISTRY_NAMES) applyTags(registries[name]);

    currentSources = sources;
    currentRegistries = registries;
    return registries;
}

export function registrySources(): RegistrySources {
    if (!currentSources) throw new Error("Gameplay registries have not been loaded");
    return currentSources;
}

export function gameRegistries(): GameRegistries {
    if (!currentRegistries) throw new Error("Gameplay registries have not been loaded");
    return currentRegistries;
}

export function registryProjection(): RegistrySetProjection {
    return registrySetProjection(gameRegistries());
}
