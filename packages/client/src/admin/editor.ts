import { Container } from "pixi.js";
import { ClientPacket } from "@bundu/shared/packet_definitions";
import type { SendPacket } from "../input/controller";
import type { World } from "../world/world";
import { createPalette, type PaletteHandle } from "./palette";
import { createToolbar, type ToolbarHandle } from "./toolbar";
import { AdminGhost } from "./ghost";
import { AdminInput } from "./input";
import { promptImportMap, promptNewMap } from "./map_dialogs";
import {
    applyEditorPrefs,
    loadEditorPrefs,
    saveEditorPrefs,
} from "./prefs";
import { createEditorState, type EditorState } from "./state";
import { createTileGridOverlay } from "./tile_grid";

export type AdminEditor = {
    container: Container;
    state: EditorState;
    setActive: (enabled: boolean) => void;
    isActive: () => boolean;
    /** Extra screen-space UI that should block paint/delete (e.g. freecam icon). */
    setExternalUiHit: (
        hit: (screenX: number, screenY: number) => boolean
    ) => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    tick: (now?: number) => void;
    destroy: () => void;
};

/**
 * Freecam map editor UI — replaces the game HUD while freecam is on.
 * Implements the shared {@link ModeUi} surface (toolbar + sidebar chrome).
 */
export function createAdminEditor(
    sendPacket: SendPacket,
    importMap: (yaml: string) => Promise<void>,
    screenToWorld: (screenX: number, screenY: number) => { x: number; y: number },
    world: World,
    worldLayer: Container
): AdminEditor {
    const state = createEditorState();
    applyEditorPrefs(state, loadEditorPrefs());
    const container = new Container();
    container.visible = false;
    container.eventMode = "static";
    container.zIndex = 100;

    let active = false;
    let palette: PaletteHandle | undefined;
    let toolbar: ToolbarHandle | undefined;
    let input: AdminInput | undefined;
    const ghost = new AdminGhost(
        world.renderer,
        () => Math.abs(worldLayer.scale.x) || 1
    );
    const tileGrid = createTileGridOverlay();
    worldLayer.addChild(tileGrid.container);

    const syncGrid = () => {
        tileGrid.setVisible(active && state.showGrid);
    };

    const persistAndRefresh = () => {
        saveEditorPrefs(state);
        toolbar?.refresh();
        input?.syncGhost();
    };

    palette = createPalette(state, persistAndRefresh);
    toolbar = createToolbar(state, {
        onTool: (tool) => {
            state.tool = tool;
            if (tool === "look") input?.cancelStroke();
            persistAndRefresh();
        },
        onToggleDrag: () => {
            state.drag = !state.drag;
            persistAndRefresh();
        },
        onToggleGroundBrush: () => {
            state.groundBrush =
                state.groundBrush === "rect" ? "tile" : "rect";
            input?.cancelStroke();
            persistAndRefresh();
        },
        onToggleRandomVariant: () => {
            state.randomVariant = !state.randomVariant;
            persistAndRefresh();
        },
        onToggleRandomRotation: () => {
            state.randomRotation = !state.randomRotation;
            persistAndRefresh();
        },
        onToggleGrid: () => {
            state.showGrid = !state.showGrid;
            syncGrid();
            persistAndRefresh();
        },
        onToggleFreeze: () => {
            state.animalsFrozen = !state.animalsFrozen;
            sendPacket(ClientPacket.AdminSetAnimalsFrozen, {
                frozen: state.animalsFrozen,
            });
            persistAndRefresh();
        },
        onToggleGhostVisible: () => {
            state.ghostVisible = !state.ghostVisible;
            sendPacket(ClientPacket.AdminSetGhostVisible, {
                visible: state.ghostVisible,
            });
            persistAndRefresh();
        },
        onKillAll: () => {
            sendPacket(ClientPacket.AdminKillAnimals, {});
        },
        onSaveMap: () => {
            sendPacket(ClientPacket.AdminSaveMap, {});
        },
        onDownloadMap: () => {
            sendPacket(ClientPacket.AdminDownloadMap, {});
        },
        onImportMap: () => {
            void promptImportMap()
                .then((yaml) => {
                    if (yaml === null) return;
                    return importMap(yaml);
                })
                .catch((error: unknown) => {
                    console.error("Map import failed", error);
                });
        },
        onNewMap: () => {
            void promptNewMap().then((result) => {
                if (!result) return;
                sendPacket(ClientPacket.AdminNewMap, {
                    worldTiles: result.worldTiles,
                });
            });
        },
    });

    container.addChild(palette.container);
    container.addChild(toolbar.container);

    world.onWorldSizeChanged = () => {
        tileGrid.rebuild();
    };

    let isExternalUi: (screenX: number, screenY: number) => boolean = () =>
        false;

    const isOverUi = (screenX: number, screenY: number) =>
        (palette?.containsPoint(screenX, screenY) ?? false) ||
        (toolbar?.containsPoint(screenX, screenY) ?? false) ||
        isExternalUi(screenX, screenY);

    input = new AdminInput(sendPacket, {
        isActive: () => active,
        isOverUi,
        screenToWorld,
        getState: () => state,
        ghost,
        pickDeleteHover: (worldX, worldY, kind) =>
            world.pickEditorDeleteHover(worldX, worldY, kind),
    });

    return {
        container,
        state,
        setActive(enabled: boolean) {
            active = enabled;
            container.visible = enabled;
            palette?.setVisible(enabled);
            if (enabled) {
                // Restore session prefs (Freeze / Ghost need re-send after exit).
                applyEditorPrefs(state, loadEditorPrefs());
                if (state.animalsFrozen) {
                    sendPacket(ClientPacket.AdminSetAnimalsFrozen, {
                        frozen: true,
                    });
                }
                if (state.ghostVisible) {
                    sendPacket(ClientPacket.AdminSetGhostVisible, {
                        visible: true,
                    });
                }
                palette?.rebuild();
                toolbar?.refresh();
                input?.syncGhost();
            } else {
                // Clear server-side freeze/ghost for this session exit, but keep
                // preferred toggles in sessionStorage for the next freecam enter.
                if (state.animalsFrozen) {
                    sendPacket(ClientPacket.AdminSetAnimalsFrozen, {
                        frozen: false,
                    });
                }
                if (state.ghostVisible) {
                    sendPacket(ClientPacket.AdminSetGhostVisible, {
                        visible: false,
                    });
                }
                input?.cancelStroke();
                ghost.clear();
            }
            syncGrid();
        },
        isActive: () => active,
        setExternalUiHit(hit) {
            isExternalUi = hit;
        },
        containsPoint(screenX, screenY) {
            if (!active) return false;
            // Editor chrome only — external overlays (freecam icon) are separate.
            return (
                (palette?.containsPoint(screenX, screenY) ?? false) ||
                (toolbar?.containsPoint(screenX, screenY) ?? false)
            );
        },
        tick(now?: number) {
            if (!active) return;
            palette?.tick(now);
        },
        destroy() {
            if (world.onWorldSizeChanged) {
                world.onWorldSizeChanged = undefined;
            }
            input?.destroy();
            ghost.clear();
            tileGrid.destroy();
            palette?.destroy();
            toolbar?.destroy();
            container.destroy({ children: true });
        },
    };
}
