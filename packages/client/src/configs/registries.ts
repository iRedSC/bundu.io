import {
    hydrateRegistrySet,
    type ClientRegistryProjection,
    type RegistryName,
    type Registry,
} from "@bundu/shared/registry";
import { replaceGroundModels } from "../world/ground/models";

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
    metadata = {
        ...projection,
        flags: projection.flags ?? {},
    };
    replaceGroundModels(projection.groundModels ?? {});
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

export function clientDecoration(decorationTypeId: number) {
    const decoration = metadata?.decorations[decorationTypeId];
    if (!decoration) throw new Error(`Unknown decoration ${decorationTypeId}`);
    return decoration;
}

export function clientModelId(location: string): string {
    return location.startsWith("bundu:") ? location.slice("bundu:".length) : location;
}

/** Item visual id (`item/wood_wall`). Bare ids collide with structure models. */
export function clientItemModelId(location: string): string {
    const id = clientModelId(location);
    return id.startsWith("item/") ? id : `item/${id}`;
}
