import { Container } from "pixi.js";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import type { SendPacket } from "../input/controller";
import type { ModeUi } from "../modes/types";
import {
    createCreativePalette,
    type CreativePaletteHandle,
} from "./palette";
import { createCreativeState, type CreativeState } from "./state";
import { CREATIVE_SPEEDS, type CreativeSpeed } from "./speeds";
import {
    createCreativeToolbar,
    type CreativeToolbarHandle,
} from "./toolbar";

export type CreativeEditor = ModeUi & {
    state: CreativeState;
    /** Apply authoritative server creative snapshot. */
    applyServerState: (packet: ServerPacket.CreativeMode) => void;
    /** Sidebar hit-test for inventory void drops (screen coords). */
    isSidebarHit: (screenX: number, screenY: number) => boolean;
};

export type CreativeEditorHooks = {
    hasCursor: () => boolean;
    /** Optimistic cursor pick for drag gestures. */
    onPickedToCursor: (itemId: number, count: number) => void;
};

/**
 * Creative mode UI — item give sidebar + cheat toolbar.
 * Keeps the gameplay HUD; chrome hides while freecam is active.
 */
export function createCreativeEditor(
    sendPacket: SendPacket,
    hooks: CreativeEditorHooks
): CreativeEditor {
    const state = createCreativeState();
    const container = new Container();
    container.visible = false;
    container.eventMode = "static";
    // Below gameplay HUD so the cursor ghost paints above the palette.
    container.zIndex = 50;

    let active = false;
    let palette: CreativePaletteHandle | undefined;
    let toolbar: CreativeToolbarHandle | undefined;

    const persistRefresh = () => {
        toolbar?.refresh();
        palette?.rebuild();
    };

    palette = createCreativePalette(state, sendPacket, hooks);
    toolbar = createCreativeToolbar(state, sendPacket, persistRefresh);
    container.addChild(palette.container);
    container.addChild(toolbar.container);

    return {
        container,
        state,
        setActive(enabled) {
            active = enabled;
            container.visible = enabled;
            palette?.setVisible(enabled);
            if (enabled) {
                palette?.rebuild();
                toolbar?.refresh();
            }
        },
        isActive: () => active,
        containsPoint(screenX, screenY) {
            if (!active) return false;
            return (
                (palette?.containsPoint(screenX, screenY) ?? false) ||
                (toolbar?.containsPoint(screenX, screenY) ?? false)
            );
        },
        isSidebarHit(screenX, screenY) {
            if (!active) return false;
            return palette?.containsPoint(screenX, screenY) ?? false;
        },
        applyServerState(packet) {
            state.godmode = packet.godmode;
            state.instakill = packet.instakill;
            const speed = packet.speed as CreativeSpeed;
            state.speed = CREATIVE_SPEEDS.includes(speed) ? speed : 1;
            toolbar?.refresh();
        },
        tick(now) {
            if (!active) return;
            palette?.tick(now);
        },
        destroy() {
            palette?.destroy();
            toolbar?.destroy();
            container.destroy({ children: true });
        },
    };
}
