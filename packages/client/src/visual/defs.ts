import player from "./defs/player.yml";
import structure from "./defs/structure.yml";
import tree from "./defs/tree.yml";
import type { ObjectDef, TileEntityDef } from "./types";

export const playerDef = player as ObjectDef;
export const structureDef = structure as ObjectDef;
export const treeDef = tree as TileEntityDef;
