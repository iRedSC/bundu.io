import { compileVisualDefs, type CompiledVisualDefs } from "./compile";
import type {
    ObjectDef,
    ContextualVisualDef,
    TileEntityDef,
} from "./types";

export type VisualDefs = Record<string, unknown>;

let assets: ReadonlySet<string> = new Set();

function validateTextures(
    defs: CompiledVisualDefs,
    availableAssets: ReadonlySet<string>
): void {
    const validate = (texture: string, path: string) => {
        if (!availableAssets.has(texture)) {
            throw new Error(`${path}: missing texture "${texture}"`);
        }
    };
    for (const def of defs.values()) {
        if ("contexts" in def) {
            for (const [name, context] of Object.entries(def.contexts)) {
                if (context.texture) {
                    validate(context.texture, `${def.id}.contexts.${name}`);
                }
            }
            continue;
        }
        for (const part of def.parts) {
            if (part.sprite) validate(part.sprite, `${def.id}.parts.${part.name}`);
        }
        for (const [variant, parts] of Object.entries(def.variants ?? {})) {
            for (const [part, texture] of Object.entries(parts)) {
                validate(texture, `${def.id}.variants.${variant}.${part}`);
            }
        }
    }
}

function compileRegistry(
    raw: VisualDefs,
    availableAssets: ReadonlySet<string> = assets
): CompiledVisualDefs {
    const defs = compileVisualDefs(raw);
    validateTextures(defs, availableAssets);
    return defs;
}

function objectDef(defs: CompiledVisualDefs, id: string): ObjectDef {
    const def = defs.get(id);
    if (!def) throw new Error(`Missing visual definition "${id}"`);
    if ("contexts" in def) {
        throw new Error(`Visual definition "${id}" is contextual`);
    }
    return def;
}

function isContextualDef(
    def: ObjectDef | ContextualVisualDef
): def is ContextualVisualDef {
    return "contexts" in def;
}

function isTileDef(def: ObjectDef | ContextualVisualDef): def is TileEntityDef {
    return "tile" in def;
}

function tileDef(defs: CompiledVisualDefs, id: string): TileEntityDef {
    const def = objectDef(defs, id);
    if (!isTileDef(def)) {
        throw new Error(`Visual definition "${id}" is not a tile entity`);
    }
    return def;
}

function concreteTileDefs(defs: CompiledVisualDefs): ReadonlyMap<string, TileEntityDef> {
    return new Map(
        [...defs]
            .filter(
                (entry): entry is [string, TileEntityDef] =>
                    isTileDef(entry[1]) && !entry[1].abstract
            )
    );
}

function contextualDefs(
    defs: CompiledVisualDefs
): ReadonlyMap<string, ContextualVisualDef> {
    return new Map(
        [...defs].filter((entry): entry is [string, ContextualVisualDef] =>
            isContextualDef(entry[1]) && !entry[1].abstract
        )
    );
}

export let visualDefs: CompiledVisualDefs = new Map();
export let playerDef: ObjectDef;
export let structureDef: ObjectDef;
export let singleTileNodeDef: TileEntityDef;
export let pointGeneratorDef: TileEntityDef;
export let treeDef: TileEntityDef;
export let tileEntityDefs: ReadonlyMap<string, TileEntityDef> = new Map();
export let contextVisualDefs: ReadonlyMap<string, ContextualVisualDef> = new Map();

export function animalDef(id: string): ObjectDef {
    return objectDef(visualDefs, id);
}

/** Concrete non-abstract object def, if registered (e.g. corpses). */
export function lookupObjectDef(id: string): ObjectDef | undefined {
    const def = visualDefs.get(id);
    if (!def || def.abstract || "contexts" in def) return undefined;
    return def;
}
export function lookupContextVisual(id: string): ContextualVisualDef | undefined {
    return contextVisualDefs.get(id) ?? contextVisualDefs.get(`item/${id}`);
}

function publishVisualDefs(
    next: CompiledVisualDefs,
    nextAssets: ReadonlySet<string>
) {
    const nextPlayer = objectDef(next, "player");
    const nextStructure = objectDef(next, "structure");
    const nextSingleTileNode = tileDef(next, "single_tile_node");
    const nextPointGenerator = tileDef(next, "point_generator");
    const nextTree = tileDef(next, "forest_tree");

    assets = nextAssets;
    visualDefs = next;
    playerDef = nextPlayer;
    structureDef = nextStructure;
    singleTileNodeDef = nextSingleTileNode;
    pointGeneratorDef = nextPointGenerator;
    treeDef = nextTree;
    tileEntityDefs = concreteTileDefs(next);
    contextVisualDefs = contextualDefs(next);
}

/** Publish server-compiled visual definitions from the pack sync payload. */
export function replaceCompiledVisualDefs(
    defs: CompiledVisualDefs,
    assetPaths?: Iterable<string>
) {
    const nextAssets = assetPaths ? new Set(assetPaths) : assets;
    validateTextures(defs, nextAssets);
    publishVisualDefs(defs, nextAssets);
}

/** Compile the complete registry before publishing any hot-reloaded definitions. */
export function replaceVisualDefs(
    raw: VisualDefs,
    assetPaths?: Iterable<string>
) {
    const nextAssets = assetPaths ? new Set(assetPaths) : assets;
    publishVisualDefs(compileRegistry(raw, nextAssets), nextAssets);
}
