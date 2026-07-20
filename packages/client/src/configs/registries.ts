import {
    hydrateRegistrySet,
    type ClientRegistryProjection,
    type RegistryName,
    type Registry,
} from "@bundu/shared/registry";
import {
    modelIdForLocation,
    type ModelKind,
} from "@bundu/shared/models/ids";
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

/** Flag name → id map from the last registry projection (may be empty). */
export function clientFlagNames(): string[] {
    return Object.keys(metadata?.flags ?? {});
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

/** Model id for a gameplay registry location (`item:bundu:wood_sword`). */
export function clientModelId(kind: ModelKind, location: string): string {
    return modelIdForLocation(kind, location);
}

export function clientItemModelId(location: string): string {
    return clientModelId("item", location);
}

export function decorationModelId(location: string): string {
    return clientModelId("decoration", location);
}
