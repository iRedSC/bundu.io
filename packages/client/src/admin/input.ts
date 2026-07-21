import {
    AdminPlaceKind,
    ClientPacket,
} from "@bundu/shared/packet_definitions";
import {
    structureOriginAtPoint,
    WORLD_BOUNDS,
    WORLD_TILES,
    worldToTile,
    type TileRot,
} from "@bundu/shared";
import {
    getVariantId,
    listVariantNames,
} from "@bundu/shared/variant_map";
import { random } from "@bundu/shared/random";
import type { SendPacket } from "../input/controller";
import type { EditorDeleteHover } from "../world/world";
import type { AdminGhost } from "./ghost";
import { clientStructurePlacement } from "../configs/registries";
import {
    categoryToKind,
    cycleRotation,
    type EditorState,
} from "./state";

export type AdminInputFacade = {
    isActive: () => boolean;
    isOverUi: (screenX: number, screenY: number) => boolean;
    screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
    getState: () => EditorState;
    ghost: AdminGhost;
    pickDeleteHover: (
        worldX: number,
        worldY: number,
        kind: AdminPlaceKind
    ) => EditorDeleteHover | null;
};

type GroundDrag = { x0: number; y0: number; x1: number; y1: number };

const DECOR_ROTATE_DEG_PER_WHEEL = 8;
const DECOR_SCALE_PER_PX = 0.01;
const DECOR_SCALE_MIN = 0.05;
const DECOR_SCALE_MAX = 20;

function clampTile(v: number): number {
    return Math.max(0, Math.min(WORLD_TILES - 1, v));
}

function clampWorld(v: number): number {
    return Math.max(0, Math.min(WORLD_BOUNDS, v));
}

function normalizeRect(drag: GroundDrag): {
    x: number;
    y: number;
    w: number;
    h: number;
} {
    const x0 = clampTile(Math.min(drag.x0, drag.x1));
    const y0 = clampTile(Math.min(drag.y0, drag.y1));
    const x1 = clampTile(Math.max(drag.x0, drag.x1));
    const y1 = clampTile(Math.max(drag.y0, drag.y1));
    return {
        x: x0,
        y: y0,
        w: x1 - x0 + 1,
        h: y1 - y0 + 1,
    };
}

/**
 * Freecam editor pointer tools — place/delete with optional drag-spam.
 * Ground place: click-drag AABB (`rect` brush) or 1×1 paint (`tile` brush).
 * Decorations: free world place; Shift+wheel rotate; right-drag scale.
 */
export class AdminInput {
    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;
    private readonly onPointerMove: (event: PointerEvent) => void;
    private readonly onPointerCancel: (event: PointerEvent) => void;
    private readonly onKeyDown: (event: KeyboardEvent) => void;
    private readonly onWheel: (event: WheelEvent) => void;
    private readonly onContextMenu: (event: Event) => void;

    private painting = false;
    private strokeOpen = false;
    private groundDrag: GroundDrag | null = null;
    private scaleDrag: { startY: number; startScale: number } | null = null;
    private lastTileKey = "";
    private lastWorldKey = "";
    private lastCursorKey = "";
    private lastScreen = { x: 0, y: 0 };

    constructor(
        private readonly sendPacket: SendPacket,
        private readonly facade: AdminInputFacade
    ) {
        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onPointerUp = (event) => this.handlePointerUp(event);
        this.onPointerMove = (event) => this.handlePointerMove(event);
        this.onPointerCancel = () => this.cancelStroke();
        this.onKeyDown = (event) => this.handleKeyDown(event);
        this.onWheel = (event) => this.handleWheel(event);
        this.onContextMenu = (event) => {
            if (!this.facade.isActive()) return;
            event.preventDefault();
        };

        document.addEventListener("pointerdown", this.onPointerDown);
        document.addEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointercancel", this.onPointerCancel);
        document.addEventListener("keydown", this.onKeyDown);
        document.addEventListener("wheel", this.onWheel, {
            passive: false,
            capture: true,
        });
        document.addEventListener("contextmenu", this.onContextMenu);
    }

    destroy() {
        document.removeEventListener("pointerdown", this.onPointerDown);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointercancel", this.onPointerCancel);
        document.removeEventListener("keydown", this.onKeyDown);
        document.removeEventListener("wheel", this.onWheel, { capture: true });
        document.removeEventListener("contextmenu", this.onContextMenu);
        this.cancelStroke();
        this.facade.ghost.clear();
    }

    /** End an in-progress paint stroke (freecam off / destroy). */
    cancelStroke(): void {
        this.painting = false;
        this.groundDrag = null;
        this.scaleDrag = null;
        this.lastTileKey = "";
        this.lastWorldKey = "";
        this.endStroke();
    }

    /** Refresh ghost from last pointer (selection / rotation / tool changes). */
    syncGhost(): void {
        if (!this.facade.isActive()) {
            this.facade.ghost.clear();
            this.lastCursorKey = "";
            return;
        }
        if (this.facade.isOverUi(this.lastScreen.x, this.lastScreen.y)) {
            this.facade.ghost.clear();
            return;
        }
        const state = this.facade.getState();
        const world = this.facade.screenToWorld(
            this.lastScreen.x,
            this.lastScreen.y
        );
        this.sendFreecamCursor(world.x, world.y);
        const tx = clampTile(worldToTile(world.x));
        const ty = clampTile(worldToTile(world.y));
        this.facade.ghost.update({
            tool: state.tool,
            selected: state.selected,
            rotation: state.rotation,
            decorationRotation: state.decorationRotation,
            decorationScale: state.decorationScale,
            worldX: world.x,
            worldY: world.y,
            groundRect: this.groundDrag
                ? normalizeRect(this.groundDrag)
                : state.tool === "place" &&
                    state.selected?.kind === AdminPlaceKind.Ground
                  ? { x: tx, y: ty, w: 1, h: 1 }
                  : undefined,
            deleteHover:
                state.tool === "delete"
                    ? this.facade.pickDeleteHover(
                          world.x,
                          world.y,
                          categoryToKind(state.category)
                      )
                    : null,
        });
    }

    /** Stream cursor world pos for the networked freecam ghost (throttled). */
    private sendFreecamCursor(worldX: number, worldY: number): void {
        const x = clampWorld(worldX);
        const y = clampWorld(worldY);
        const key = `${(x * 10) | 0},${(y * 10) | 0}`;
        if (key === this.lastCursorKey) return;
        this.lastCursorKey = key;
        this.sendPacket(ClientPacket.FreecamCursor, { x, y });
    }

    private beginStroke(): void {
        if (this.strokeOpen) return;
        this.strokeOpen = true;
        this.sendPacket(ClientPacket.AdminStrokeBegin, {});
    }

    private endStroke(): void {
        if (!this.strokeOpen) return;
        this.strokeOpen = false;
        this.sendPacket(ClientPacket.AdminStrokeEnd, {});
    }

    private finishGroundDrag(): void {
        if (!this.groundDrag) return;
        const rect = normalizeRect(this.groundDrag);
        this.groundDrag = null;
        this.painting = false;
        this.lastTileKey = "";
        this.placeGroundRect(rect);
        this.endStroke();
        this.syncGhost();
    }

    private handleWheel(event: WheelEvent) {
        if (!this.facade.isActive()) return;
        if (!event.shiftKey) return;
        const state = this.facade.getState();
        if (state.tool !== "place") return;
        if (state.selected?.kind !== AdminPlaceKind.Decoration) return;
        if (this.facade.isOverUi(event.clientX, event.clientY)) return;

        event.preventDefault();
        event.stopPropagation();
        const delta =
            event.deltaY === 0
                ? 0
                : event.deltaY > 0
                  ? -DECOR_ROTATE_DEG_PER_WHEEL
                  : DECOR_ROTATE_DEG_PER_WHEEL;
        state.decorationRotation =
            ((state.decorationRotation + delta) % 360 + 360) % 360;
        this.syncGhost();
    }

    private handleKeyDown(event: KeyboardEvent) {
        if (!this.facade.isActive()) return;
        if (document.getElementById("chat-input") === document.activeElement) {
            return;
        }

        const mod = event.ctrlKey || event.metaKey;
        if (mod && (event.key === "z" || event.key === "Z")) {
            event.preventDefault();
            this.cancelStroke();
            if (event.shiftKey) {
                this.sendPacket(ClientPacket.AdminRedo, {});
            } else {
                this.sendPacket(ClientPacket.AdminUndo, {});
            }
            this.syncGhost();
            return;
        }
        if (mod && (event.key === "y" || event.key === "Y")) {
            event.preventDefault();
            this.cancelStroke();
            this.sendPacket(ClientPacket.AdminRedo, {});
            this.syncGhost();
            return;
        }

        if (event.key !== "r" && event.key !== "R") return;
        const state = this.facade.getState();
        if (state.tool !== "place") return;
        // R stays snappy tile rotate for resources/structures — not decorations.
        if (state.selected?.kind === AdminPlaceKind.Decoration) return;
        event.preventDefault();
        state.rotation = cycleRotation(state.rotation);
        this.syncGhost();
    }

    private handlePointerDown(event: PointerEvent) {
        if (!this.facade.isActive()) return;
        this.lastScreen = { x: event.clientX, y: event.clientY };

        const state = this.facade.getState();
        // Look mode: move the networked cursor only — no place/delete/scale.
        if (state.tool === "look") {
            if (!this.facade.isOverUi(event.clientX, event.clientY)) {
                this.syncGhost();
            }
            return;
        }

        // Right-button drag scales decorations.
        if (event.button === 2) {
            if (this.facade.isOverUi(event.clientX, event.clientY)) return;
            if (state.tool !== "place") return;
            if (state.selected?.kind !== AdminPlaceKind.Decoration) return;
            this.scaleDrag = {
                startY: event.clientY,
                startScale: state.decorationScale,
            };
            return;
        }

        if (event.button !== 0) return;
        if (this.facade.isOverUi(event.clientX, event.clientY)) {
            this.facade.ghost.clear();
            return;
        }

        const world = this.facade.screenToWorld(event.clientX, event.clientY);
        const tx = clampTile(worldToTile(world.x));
        const ty = clampTile(worldToTile(world.y));

        if (state.tool === "place") {
            if (!state.selected) return;
            if (
                state.selected.kind === AdminPlaceKind.Ground &&
                state.groundBrush === "rect"
            ) {
                this.painting = true;
                this.lastTileKey = "";
                this.groundDrag = { x0: tx, y0: ty, x1: tx, y1: ty };
                this.beginStroke();
                this.syncGhost();
                return;
            }
            this.painting = true;
            this.groundDrag = null;
            this.lastTileKey = "";
            this.lastWorldKey = "";
            this.beginStroke();
            this.syncGhost();
            this.applyAtScreen(event.clientX, event.clientY, true);
            return;
        }

        if (state.tool !== "delete") return;
        this.painting = true;
        this.groundDrag = null;
        this.lastTileKey = "";
        this.lastWorldKey = "";
        this.beginStroke();
        this.syncGhost();
        this.applyAtScreen(event.clientX, event.clientY, true);
    }

    private handlePointerUp(event: PointerEvent) {
        if (event.button === 2) {
            this.scaleDrag = null;
            return;
        }
        if (event.button !== 0) return;
        if (this.groundDrag) {
            this.finishGroundDrag();
            return;
        }
        this.painting = false;
        this.lastTileKey = "";
        this.lastWorldKey = "";
        this.endStroke();
    }

    private handlePointerMove(event: PointerEvent) {
        this.lastScreen = { x: event.clientX, y: event.clientY };
        if (!this.facade.isActive()) {
            this.painting = false;
            this.groundDrag = null;
            this.scaleDrag = null;
            this.endStroke();
            this.facade.ghost.clear();
            return;
        }

        const state = this.facade.getState();
        if (state.tool === "look") {
            this.painting = false;
            this.groundDrag = null;
            this.scaleDrag = null;
            if (this.facade.isOverUi(event.clientX, event.clientY)) {
                this.facade.ghost.clear();
                return;
            }
            this.syncGhost();
            return;
        }

        if (this.scaleDrag) {
            const deltaY = this.scaleDrag.startY - event.clientY;
            state.decorationScale = Math.min(
                DECOR_SCALE_MAX,
                Math.max(
                    DECOR_SCALE_MIN,
                    this.scaleDrag.startScale + deltaY * DECOR_SCALE_PER_PX
                )
            );
            this.syncGhost();
            return;
        }

        if (this.facade.isOverUi(event.clientX, event.clientY)) {
            // Keep an in-progress ground drag alive; only hide the ghost over UI.
            if (!this.groundDrag) this.facade.ghost.clear();
            return;
        }

        if (this.groundDrag) {
            const world = this.facade.screenToWorld(event.clientX, event.clientY);
            this.groundDrag.x1 = clampTile(worldToTile(world.x));
            this.groundDrag.y1 = clampTile(worldToTile(world.y));
            this.syncGhost();
            return;
        }

        this.syncGhost();

        if (!this.painting) return;
        if (!state.drag) return;
        this.applyAtScreen(event.clientX, event.clientY, false);
    }

    private placeRotation(state: EditorState): TileRot {
        if (!state.randomRotation) return state.rotation;
        return random.integer(0, 3) as TileRot;
    }

    private decorationRotation(state: EditorState): number {
        if (!state.randomRotation) return state.decorationRotation;
        return random.integer(0, 359);
    }

    private placeGroundRect(rect: {
        x: number;
        y: number;
        w: number;
        h: number;
    }): void {
        const state = this.facade.getState();
        const selected = state.selected;
        if (!selected || selected.kind !== AdminPlaceKind.Ground) return;
        // Full-world rects are the reserved base floor (wipe restores ocean).
        if (rect.w >= WORLD_TILES && rect.h >= WORLD_TILES) return;
        this.sendPacket(ClientPacket.AdminPlace, {
            kind: AdminPlaceKind.Ground,
            typeId: selected.id,
            x: rect.x,
            y: rect.y,
            rotation: 0,
            variant: 0,
            w: rect.w,
            h: rect.h,
            scale: 1,
        });
    }

    private applyAtScreen(screenX: number, screenY: number, isClick: boolean) {
        const state = this.facade.getState();
        if (state.tool === "look") return;
        const world = this.facade.screenToWorld(screenX, screenY);

        if (state.tool === "delete") {
            const key = `${Math.round(world.x)},${Math.round(world.y)}`;
            if (!isClick && key === this.lastWorldKey) return;
            if (!state.drag && !isClick) return;
            this.lastWorldKey = key;
            this.sendPacket(ClientPacket.AdminDeleteAt, {
                x: clampWorld(world.x),
                y: clampWorld(world.y),
                kind: categoryToKind(state.category),
            });
            return;
        }

        const selected = state.selected;
        if (!selected) return;

        if (selected.kind === AdminPlaceKind.Decoration) {
            const key = `${Math.round(world.x)},${Math.round(world.y)}`;
            if (!isClick && key === this.lastWorldKey) return;
            if (!state.drag && !isClick) return;
            this.lastWorldKey = key;
            this.sendPacket(ClientPacket.AdminPlace, {
                kind: AdminPlaceKind.Decoration,
                typeId: selected.id,
                x: clampWorld(world.x),
                y: clampWorld(world.y),
                rotation: this.decorationRotation(state),
                variant: 0,
                w: 1,
                h: 1,
                scale: state.decorationScale,
            });
            return;
        }

        if (selected.kind === AdminPlaceKind.Ground) {
            if (state.groundBrush !== "tile") return;
            const x = clampTile(worldToTile(world.x));
            const y = clampTile(worldToTile(world.y));
            const key = `${x},${y}`;
            if (!isClick && key === this.lastTileKey) return;
            if (!state.drag && !isClick) return;
            this.lastTileKey = key;
            this.placeGroundRect({ x, y, w: 1, h: 1 });
            return;
        }

        const x = clampTile(worldToTile(world.x));
        const y = clampTile(worldToTile(world.y));
        const key = `${x},${y}`;

        if (!isClick && key === this.lastTileKey) return;
        if (!state.drag && !isClick) return;
        this.lastTileKey = key;

        const variantName = state.randomVariant
            ? random.choice([...listVariantNames()])
            : "base";
        let variant = 0;
        try {
            variant = getVariantId(variantName) ?? 0;
        } catch {
            variant = 0;
        }

        const rotation = this.placeRotation(state);
        const origin =
            selected.kind === AdminPlaceKind.Structure
                ? structureOriginAtPoint(
                      { x, y },
                      clientStructurePlacement(selected.id).blocked,
                      rotation
                  )
                : { x, y };
        this.sendPacket(ClientPacket.AdminPlace, {
            kind: selected.kind,
            typeId: selected.id,
            x: origin.x,
            y: origin.y,
            rotation,
            variant,
            w: 1,
            h: 1,
            scale: 1,
        });
    }
}
