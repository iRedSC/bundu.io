import { Container } from "pixi.js";
import { ClientPacket } from "@bundu/shared/packet_definitions";
import type { SendPacket } from "../input/controller";
import type { World } from "../world/world";
import { createPalette, type PaletteHandle } from "./palette";
import { createToolbar, type ToolbarHandle } from "./toolbar";
import { AdminGhost } from "./ghost";
import { AdminInput } from "./input";
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
 */
export function createAdminEditor(
    sendPacket: SendPacket,
    screenToWorld: (screenX: number, screenY: number) => { x: number; y: number },
    world: World,
    worldLayer: Container
): AdminEditor {
    const state = createEditorState();
    const container = new Container();
    container.visible = false;
    container.eventMode = "static";
    container.zIndex = 100;

    let active = false;
    let palette: PaletteHandle | undefined;
    let toolbar: ToolbarHandle | undefined;
    let input: AdminInput | undefined;
    const ghost = new AdminGhost(world.renderer);
    const tileGrid = createTileGridOverlay();
    worldLayer.addChild(tileGrid.container);

    const syncGrid = () => {
        tileGrid.setVisible(active && state.showGrid);
    };

    const refreshToolbar = () => {
        toolbar?.refresh();
        input?.syncGhost();
    };

    palette = createPalette(state, refreshToolbar);
    toolbar = createToolbar(state, {
        onTool: (tool) => {
            state.tool = tool;
            refreshToolbar();
        },
        onToggleDrag: () => {
            state.drag = !state.drag;
            refreshToolbar();
        },
        onToggleGroundBrush: () => {
            state.groundBrush =
                state.groundBrush === "rect" ? "tile" : "rect";
            input?.cancelStroke();
            refreshToolbar();
        },
        onToggleRandomVariant: () => {
            state.randomVariant = !state.randomVariant;
            refreshToolbar();
        },
        onToggleRandomRotation: () => {
            state.randomRotation = !state.randomRotation;
            refreshToolbar();
        },
        onToggleGrid: () => {
            state.showGrid = !state.showGrid;
            syncGrid();
            refreshToolbar();
        },
        onToggleFreeze: () => {
            state.animalsFrozen = !state.animalsFrozen;
            sendPacket(ClientPacket.AdminSetAnimalsFrozen, {
                frozen: state.animalsFrozen,
            });
            refreshToolbar();
        },
        onToggleGhostVisible: () => {
            state.ghostVisible = !state.ghostVisible;
            sendPacket(ClientPacket.AdminSetGhostVisible, {
                visible: state.ghostVisible,
            });
            refreshToolbar();
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
        onWipeMap: () => {
                if (
                !window.confirm(
                    "Wipe the entire map?\n\nThis removes all ground overlays, decorations, resources, structures, animals, and items, then restores an ocean base. It cannot be undone."
                )
            ) {
                return;
            }
            sendPacket(ClientPacket.AdminWipeMap, {});
        },
    });

    container.addChild(palette.container);
    container.addChild(toolbar.container);

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
            if (enabled) {
                palette?.rebuild();
                toolbar?.refresh();
                input?.syncGhost();
            } else {
                state.animalsFrozen = false;
                state.ghostVisible = false;
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
            input?.destroy();
            ghost.clear();
            tileGrid.destroy();
            palette?.destroy();
            toolbar?.destroy();
            container.destroy({ children: true });
        },
    };
}
