import type { EditorState, EditorTool } from "./state";
import {
    createModeToolbar,
    type ModeToolbarDef,
    type ModeToolbarHandle,
} from "../modes/toolbar";

type VisibleWhen = (state: EditorState) => boolean;

const always: VisibleWhen = () => true;
const whenGround: VisibleWhen = (s) => s.category === "ground";
const whenVariants: VisibleWhen = (s) =>
    s.category === "resources" || s.category === "structures";
const whenRotation: VisibleWhen = (s) =>
    s.category === "resources" ||
    s.category === "structures" ||
    s.category === "decorations";

export type ToolbarHandle = ModeToolbarHandle;

export type ToolbarHandlers = {
    onTool: (tool: EditorTool) => void;
    onToggleDrag: () => void;
    onToggleGroundBrush: () => void;
    onToggleRandomVariant: () => void;
    onToggleRandomRotation: () => void;
    onToggleGrid: () => void;
    onToggleFreeze: () => void;
    onToggleGhostVisible: () => void;
    onKillAll: () => void;
    onSaveMap: () => void;
    onDownloadMap: () => void;
    onImportMap: () => void;
    onNewMap: () => void;
};

/** Freecam map-editor toolbar — thin config over the shared mode toolbar. */
export function createToolbar(
    state: EditorState,
    handlers: ToolbarHandlers
): ToolbarHandle {
    const defs: ModeToolbarDef<EditorState, EditorTool>[] = [
        {
            kind: "segmented",
            id: "tool",
            getActive: () => state.tool,
            options: [
                {
                    id: "look",
                    label: "Look",
                    onClick: () => handlers.onTool("look"),
                },
                {
                    id: "place",
                    label: "Place",
                    onClick: () => handlers.onTool("place"),
                },
                {
                    id: "delete",
                    label: "Delete",
                    onClick: () => handlers.onTool("delete"),
                },
            ],
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "drag",
            label: "Drag",
            getActive: () => state.drag,
            onClick: () => handlers.onToggleDrag(),
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "ground-1x1",
            label: "1×1",
            getActive: () => state.groundBrush === "tile",
            onClick: () => handlers.onToggleGroundBrush(),
            visibleWhen: whenGround,
        },
        {
            kind: "stack",
            id: "random",
            visibleWhen: (s) => whenVariants(s) || whenRotation(s),
            children: [
                {
                    kind: "button",
                    id: "variant",
                    label: "Rand Var",
                    getActive: () => state.randomVariant,
                    onClick: () => handlers.onToggleRandomVariant(),
                    visibleWhen: whenVariants,
                },
                {
                    kind: "button",
                    id: "rotation",
                    label: "Rand Rot",
                    getActive: () => state.randomRotation,
                    onClick: () => handlers.onToggleRandomRotation(),
                    visibleWhen: whenRotation,
                },
            ],
        },
        {
            kind: "button",
            id: "grid",
            label: "Grid",
            getActive: () => state.showGrid,
            onClick: () => handlers.onToggleGrid(),
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "freeze",
            label: "Freeze",
            getActive: () => state.animalsFrozen,
            onClick: () => handlers.onToggleFreeze(),
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "ghost-vis",
            label: "Ghost",
            getActive: () => state.ghostVisible,
            onClick: () => handlers.onToggleGhostVisible(),
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "kill",
            label: "Kill All",
            onClick: () => handlers.onKillAll(),
            visibleWhen: always,
        },
        {
            kind: "stack",
            id: "map-io",
            visibleWhen: always,
            children: [
                {
                    kind: "button",
                    id: "save-map",
                    label: "Save Map",
                    onClick: () => handlers.onSaveMap(),
                    visibleWhen: always,
                },
                {
                    kind: "button",
                    id: "download-map",
                    label: "Download",
                    onClick: () => handlers.onDownloadMap(),
                    visibleWhen: always,
                },
                {
                    kind: "button",
                    id: "import-map",
                    label: "Import",
                    onClick: () => handlers.onImportMap(),
                    visibleWhen: always,
                },
            ],
        },
        {
            kind: "button",
            id: "new-map",
            label: "New Map",
            onClick: () => handlers.onNewMap(),
            visibleWhen: always,
        },
    ];

    return createModeToolbar(state, defs);
}
