import { loadEditorMapOrBlank } from "../admin/map_io.js";
import type { World } from "../engine";

/** Load the freecam-saved editor map, or a blank ocean world. */
export function loadMap(world: World) {
    loadEditorMapOrBlank(world);
}
