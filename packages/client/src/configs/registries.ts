import {
    hydrateRegistrySet,
    type ClientRegistryProjection,
    type RegistryName,
    type Registry,
} from "@bundu/shared/registry";

let current:
    | {
          [K in RegistryName]: Registry<K>;
      }
    | undefined;
let metadata: ClientRegistryProjection | undefined;

export function replaceClientRegistries(
    projection: ClientRegistryProjection
): void {
    current = hydrateRegistrySet(projection);
    metadata = projection;
}

export function clientRegistries(): {
    [K in RegistryName]: Registry<K>;
} {
    if (!current) throw new Error("Client registries have not been loaded");
    return current;
}

export function clientStructurePlacement(structureId: number) {
    const placement = metadata?.structures[structureId];
    if (!placement) throw new Error(`Unknown structure placement ${structureId}`);
    return placement;
}

export function clientGroundType(groundTypeId: number) {
    const ground = metadata?.groundTypes[groundTypeId];
    if (!ground) throw new Error(`Unknown ground type ${groundTypeId}`);
    return ground;
}

export function clientModelId(location: string): string {
    return location.startsWith("bundu:") ? location.slice("bundu:".length) : location;
}
