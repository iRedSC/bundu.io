import player from "./defs/player.yml";
import structure from "./defs/structure.yml";
import singleTileNode from "./defs/single_tile_node.yml";
import pointGenerator from "./defs/point_generator.yml";
import tree from "./defs/tree.yml";
import type {
    ObjectDef,
    StructuredTileEntityDef,
    TextureTileEntityDef,
    TileEntityDef,
} from "./types";

export let playerDef = player as ObjectDef;
export let structureDef = structure as ObjectDef;
export let singleTileNodeDef = singleTileNode as TextureTileEntityDef;
export let pointGeneratorDef = pointGenerator as TextureTileEntityDef;
export let treeDef = tree as StructuredTileEntityDef;

export let tileEntityDefs: ReadonlyMap<string, TileEntityDef> = new Map<
    string,
    TileEntityDef
>([
    [singleTileNodeDef.id, singleTileNodeDef],
    [pointGeneratorDef.id, pointGeneratorDef],
    [treeDef.id, treeDef],
]);

export type VisualDefs = {
    player: ObjectDef;
    structure: ObjectDef;
    single_tile_node: TextureTileEntityDef;
    point_generator: TextureTileEntityDef;
    tree: StructuredTileEntityDef;
};

export function replaceVisualDefs(defs: VisualDefs) {
    playerDef = defs.player;
    structureDef = defs.structure;
    singleTileNodeDef = defs.single_tile_node;
    pointGeneratorDef = defs.point_generator;
    treeDef = defs.tree;
    tileEntityDefs = new Map<string, TileEntityDef>([
        [singleTileNodeDef.id, singleTileNodeDef],
        [pointGeneratorDef.id, pointGeneratorDef],
        [treeDef.id, treeDef],
    ]);
}
