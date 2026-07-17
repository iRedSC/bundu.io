/**
 * Freecam admin editor surface — place/delete/freeze/kill-all/undo.
 * Kept separate from gameplay systems; gated by freecam + cheats.
 */
export { canUseEditor } from "./auth.js";
export { AdminEditorSystem } from "./editor.js";
export { clearEditorHistory } from "./history.js";
export {
    areAnimalsFrozen,
    clearAnimalsFrozenFor,
    setAnimalsFrozen,
} from "./state.js";
