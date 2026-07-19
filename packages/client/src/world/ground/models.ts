import type {
    GroundModelDef as PackGroundModelDef,
    OceanGroundModelDef,
} from "@bundu/shared/ground_models";
import {
    isOceanGroundModel as isOceanPackModel,
    parseHexColor,
} from "@bundu/shared/ground_models";
import { createOceanFill, createOceanGround } from "./ocean";
import { createSolidGround } from "./solid";
import type { GroundModelDef } from "./types";

let packModels: Readonly<Record<string, PackGroundModelDef>> = {};

function toClientModel(def: PackGroundModelDef): GroundModelDef {
    if (isOceanPackModel(def)) {
        return {
            id: def.id,
            kind: "ocean",
            color: def.color,
            textures: def.textures,
            create(bounds, zIndex) {
                return createOceanGround(def, bounds, zIndex);
            },
            createFill(bounds, zIndex) {
                return createOceanFill(def, bounds, zIndex);
            },
        };
    }
    const rgb = parseHexColor(def.color);
    return {
        id: def.id,
        kind: "solid",
        color: def.color,
        create(bounds, zIndex) {
            return createSolidGround(rgb, bounds, zIndex);
        },
    };
}

/** Replace pack-authored ground models (called on resource-pack sync). */
export function replaceGroundModels(
    models: Readonly<Record<string, PackGroundModelDef>>
): void {
    packModels = models;
}

export function groundModel(id: string): GroundModelDef {
    const pack = packModels[id];
    if (!pack) {
        throw new Error(`Unknown ground model "${id}"`);
    }
    return toClientModel(pack);
}

export function isOceanGroundModel(id: string): boolean {
    const pack = packModels[id];
    return pack !== undefined && isOceanPackModel(pack);
}

export function oceanGroundModel(id: string): OceanGroundModelDef {
    const pack = packModels[id];
    if (!pack || !isOceanPackModel(pack)) {
        throw new Error(`Expected ocean ground model "${id}"`);
    }
    return pack;
}

export function listGroundModels(): readonly GroundModelDef[] {
    return Object.keys(packModels).map((id) => groundModel(id));
}
