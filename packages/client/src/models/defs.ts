import { compileModelDefs, type CompiledModelDefs } from "./compile";
import type { ModelDef, ObjectDef, TileEntityDef } from "./types";
import { isTileModel, modelHasParts } from "./types";

export type ModelDefs = Record<string, unknown>;

let assets: ReadonlySet<string> = new Set();

function validateTextures(
    defs: CompiledModelDefs,
    availableAssets: ReadonlySet<string>
): void {
    const validate = (texture: string, path: string) => {
        if (!availableAssets.has(texture)) {
            throw new Error(`${path}: missing texture "${texture}"`);
        }
    };
    for (const def of defs.values()) {
        if (def.texture) validate(def.texture, `${def.id}.texture`);
        for (const [name, display] of Object.entries(def.displays)) {
            if (display.texture) {
                validate(display.texture, `${def.id}.displays.${name}`);
            }
        }
        for (const part of def.parts) {
            if (part.sprite) validate(part.sprite, `${def.id}.parts.${part.name}`);
        }
        for (const [variant, parts] of Object.entries(def.variants ?? {})) {
            for (const [part, texture] of Object.entries(parts)) {
                validate(texture, `${def.id}.variants.${variant}.${part}`);
            }
        }
        if (
            def.footsteps &&
            typeof def.footsteps === "object" &&
            def.footsteps.texture
        ) {
            validate(def.footsteps.texture, `${def.id}.footsteps.texture`);
        }
    }
}

function compileRegistry(
    raw: ModelDefs,
    availableAssets: ReadonlySet<string> = assets
): CompiledModelDefs {
    const defs = compileModelDefs(raw);
    validateTextures(defs, availableAssets);
    return defs;
}

function requireAssembled(defs: CompiledModelDefs, id: string): ObjectDef {
    const def = defs.get(id);
    if (!def) throw new Error(`Missing model definition "${id}"`);
    if (!modelHasParts(def)) {
        throw new Error(`Model definition "${id}" has no parts`);
    }
    return def;
}

function requireTile(defs: CompiledModelDefs, id: string): TileEntityDef {
    const def = requireAssembled(defs, id);
    if (!isTileModel(def)) {
        throw new Error(`Model definition "${id}" is not a tile entity`);
    }
    return def;
}

function concreteTileDefs(defs: CompiledModelDefs): ReadonlyMap<string, TileEntityDef> {
    return new Map(
        [...defs].filter(
            (entry): entry is [string, TileEntityDef] =>
                isTileModel(entry[1]) && !entry[1].abstract
        )
    );
}

export let modelDefs: CompiledModelDefs = new Map();
export let playerDef: ObjectDef;
export let structureDef: ObjectDef;
export let singleTileNodeDef: TileEntityDef;
export let pointGeneratorDef: TileEntityDef;
export let treeDef: TileEntityDef;
export let tileEntityDefs: ReadonlyMap<string, TileEntityDef> = new Map();

export function animalDef(id: string): ObjectDef {
    return requireAssembled(modelDefs, id);
}

/** Concrete non-abstract assembled model, if registered (e.g. corpses). */
export function lookupObjectDef(id: string): ObjectDef | undefined {
    const def = modelDefs.get(id);
    if (!def || def.abstract || !modelHasParts(def)) return undefined;
    return def;
}

/** Any concrete model (texture, assembled, or tile). */
export function lookupModel(id: string): ModelDef | undefined {
    const def = modelDefs.get(id);
    if (!def || def.abstract) return undefined;
    return def;
}

/** Display entry for a model, or undefined. */
export function lookupDisplay(
    id: string,
    display: string
): ModelDef["displays"][string] | undefined {
    return lookupModel(id)?.displays[display];
}

function publishModelDefs(
    next: CompiledModelDefs,
    nextAssets: ReadonlySet<string>
) {
    const nextPlayer = requireAssembled(next, "entity_type:bundu:player");
    const nextStructure = requireAssembled(next, "model:bundu:structure");
    const nextSingleTileNode = requireTile(next, "model:bundu:single_tile_node");
    const nextPointGenerator = requireTile(next, "structure:bundu:point_generator");
    const nextTree = requireTile(next, "resource:bundu:forest_tree");

    assets = nextAssets;
    modelDefs = next;
    playerDef = nextPlayer;
    structureDef = nextStructure;
    singleTileNodeDef = nextSingleTileNode;
    pointGeneratorDef = nextPointGenerator;
    treeDef = nextTree;
    tileEntityDefs = concreteTileDefs(next);
}

/** Publish server-compiled model definitions from the pack sync payload. */
export function replaceCompiledModelDefs(
    defs: CompiledModelDefs,
    assetPaths?: Iterable<string>
) {
    const nextAssets = assetPaths ? new Set(assetPaths) : assets;
    validateTextures(defs, nextAssets);
    publishModelDefs(defs, nextAssets);
}

/** Compile the complete registry before publishing any hot-reloaded definitions. */
export function replaceModelDefs(
    raw: ModelDefs,
    assetPaths?: Iterable<string>
) {
    const nextAssets = assetPaths ? new Set(assetPaths) : assets;
    publishModelDefs(compileRegistry(raw, nextAssets), nextAssets);
}
