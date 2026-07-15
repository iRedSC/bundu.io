import alligator from "./defs/actors/alligator.yml";
import animal from "./defs/actors/animal.yml";
import bear from "./defs/actors/bear.yml";
import bee from "./defs/actors/bee.yml";
import deer from "./defs/actors/deer.yml";
import elephant from "./defs/actors/elephant.yml";
import komodoDragon from "./defs/actors/komodo_dragon.yml";
import player from "./defs/actors/player.yml";
import queenBee from "./defs/actors/queen_bee.yml";
import raindeer from "./defs/actors/raindeer.yml";
import ram from "./defs/actors/ram.yml";
import rottable from "./defs/base/rottable.yml";
import singleTileNode from "./defs/base/single_tile_node.yml";
import amethystDoor from "./defs/doors/amethyst_door.yml";
import diamondDoor from "./defs/doors/diamond_door.yml";
import door from "./defs/doors/door.yml";
import goldDoor from "./defs/doors/gold_door.yml";
import stoneDoor from "./defs/doors/stone_door.yml";
import woodDoor from "./defs/doors/wood_door.yml";
import tree from "./defs/nature/tree.yml";
import pointGenerator from "./defs/structures/point_generator.yml";
import structure from "./defs/structures/structure.yml";
import { compileVisualDefs, type CompiledVisualDefs } from "./compile";
import type {
    ObjectDef,
    StructuredTileEntityDef,
    TextureTileEntityDef,
    TileEntityDef,
} from "./types";

const bundledDefs: Record<string, unknown> = {
    alligator,
    animal,
    amethyst_door: amethystDoor,
    bear,
    bee,
    deer,
    diamond_door: diamondDoor,
    door,
    elephant,
    gold_door: goldDoor,
    komodo_dragon: komodoDragon,
    player,
    point_generator: pointGenerator,
    queen_bee: queenBee,
    raindeer,
    ram,
    rottable,
    single_tile_node: singleTileNode,
    stone_door: stoneDoor,
    structure,
    tree,
    wood_door: woodDoor,
};

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

export let visualDefs = compileVisualDefs(bundledDefs);
export let playerDef = objectDef(visualDefs, "player");
export let structureDef = objectDef(visualDefs, "structure");
export let singleTileNodeDef = tileDef(visualDefs, "single_tile_node") as TextureTileEntityDef;
export let pointGeneratorDef = tileDef(visualDefs, "point_generator") as TextureTileEntityDef;
export let treeDef = tileDef(visualDefs, "forest_tree") as StructuredTileEntityDef;
export let tileEntityDefs = concreteTileDefs(visualDefs);

export function animalDef(id: string): ObjectDef {
    return objectDef(visualDefs, id);
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
