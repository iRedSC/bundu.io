import { compileVisualDefs, type CompiledVisualDefs } from "./compile";
import { bundledVisualDefs } from "./generated_defs";
import type {
    ObjectDef,
    StructuredTileEntityDef,
    TextureTileEntityDef,
    TileEntityDef,
} from "./types";

export type VisualDefs = Record<string, unknown>;

function objectDef(defs: CompiledVisualDefs, id: string): ObjectDef {
    const def = defs.get(id);
    if (!def) throw new Error(`Missing visual definition "${id}"`);
    return def;
}

function isTileDef(def: ObjectDef): def is TileEntityDef {
    return "tile" in def;
}

function tileDef(defs: CompiledVisualDefs, id: string): TileEntityDef {
    const def = objectDef(defs, id);
    if (!isTileDef(def)) throw new Error(`Visual definition "${id}" is not a tile entity`);
    return def;
}

function concreteTileDefs(defs: CompiledVisualDefs): ReadonlyMap<string, TileEntityDef> {
    return new Map(
        [...defs]
            .filter((entry): entry is [string, TileEntityDef] => isTileDef(entry[1]) && !entry[1].abstract)
    );
}

export let visualDefs = compileVisualDefs(bundledVisualDefs);
export let playerDef = objectDef(visualDefs, "player");
export let structureDef = objectDef(visualDefs, "structure");
export let singleTileNodeDef = tileDef(visualDefs, "single_tile_node") as TextureTileEntityDef;
export let pointGeneratorDef = tileDef(visualDefs, "point_generator") as TextureTileEntityDef;
export let treeDef = tileDef(visualDefs, "forest_tree") as StructuredTileEntityDef;
export let tileEntityDefs = concreteTileDefs(visualDefs);

export function animalDef(id: string): ObjectDef {
    return objectDef(visualDefs, id);
}

/** Concrete non-abstract object def, if registered (e.g. corpses). */
export function lookupObjectDef(id: string): ObjectDef | undefined {
    const def = visualDefs.get(id);
    if (!def || def.abstract) return undefined;
    return def;
}

/** Compile the complete registry before publishing any hot-reloaded definitions. */
export function replaceVisualDefs(raw: VisualDefs) {
    const next = compileVisualDefs(raw);
    const nextPlayer = objectDef(next, "player");
    const nextStructure = objectDef(next, "structure");
    const nextSingleTileNode = tileDef(next, "single_tile_node") as TextureTileEntityDef;
    const nextPointGenerator = tileDef(next, "point_generator") as TextureTileEntityDef;
    const nextTree = tileDef(next, "forest_tree") as StructuredTileEntityDef;

    visualDefs = next;
    playerDef = nextPlayer;
    structureDef = nextStructure;
    singleTileNodeDef = nextSingleTileNode;
    pointGeneratorDef = nextPointGenerator;
    treeDef = nextTree;
    tileEntityDefs = concreteTileDefs(next);
}
