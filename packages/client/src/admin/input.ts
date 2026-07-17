import {
    AdminPlaceKind,
    ClientPacket,
} from "@bundu/shared/packet_definitions";
import { WORLD_TILES, worldToTile, type TileRot } from "@bundu/shared/tiles";
import {
    getVariantId,
    listVariantNames,
} from "@bundu/shared/variant_map";
import { random } from "@bundu/shared/random";
import type { SendPacket } from "../input/controller";
import type { EditorDeleteHover } from "../world/world";
import type { AdminGhost } from "./ghost";
import {
    cycleRotation,
    type EditorState,
} from "./state";

export type AdminInputFacade = {
    isActive: () => boolean;
    isOverUi: (screenX: number, screenY: number) => boolean;
    screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
    getState: () => EditorState;
    ghost: AdminGhost;
    pickDeleteHover: (tx: number, ty: number) => EditorDeleteHover | null;
};

type GroundDrag = { x0: number; y0: number; x1: number; y1: number };

function clampTile(v: number): number {
    return Math.max(0, Math.min(WORLD_TILES - 1, v));
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
 * Ground place uses a click-drag AABB instead of per-tile spam.
 */
export class AdminInput {
    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;
    private readonly onPointerMove: (event: PointerEvent) => void;
    private readonly onPointerCancel: (event: PointerEvent) => void;
    private readonly onKeyDown: (event: KeyboardEvent) => void;

    private painting = false;
    private strokeOpen = false;
    private groundDrag: GroundDrag | null = null;
    private lastTileKey = "";
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

        document.addEventListener("pointerdown", this.onPointerDown);
        document.addEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointercancel", this.onPointerCancel);
        document.addEventListener("keydown", this.onKeyDown);
    }

    destroy() {
        document.removeEventListener("pointerdown", this.onPointerDown);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointercancel", this.onPointerCancel);
        document.removeEventListener("keydown", this.onKeyDown);
        this.cancelStroke();
        this.facade.ghost.clear();
    }

    /** End an in-progress paint stroke (freecam off / destroy). */
    cancelStroke(): void {
        this.painting = false;
        this.groundDrag = null;
        this.lastTileKey = "";
        this.endStroke();
    }

    /** Refresh ghost from last pointer (selection / rotation / tool changes). */
    syncGhost(): void {
        if (!this.facade.isActive()) {
            this.facade.ghost.clear();
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
        const tx = clampTile(worldToTile(world.x));
        const ty = clampTile(worldToTile(world.y));
        this.facade.ghost.update({
            tool: state.tool,
            selected: state.selected,
            rotation: state.rotation,
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
                    ? this.facade.pickDeleteHover(tx, ty)
                    : null,
        });
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

    private handleKeyDown(event: KeyboardEvent) {
        if (!this.facade.isActive()) return;
        const chat = document.querySelector<HTMLInputElement>("#chat-input");
        if (chat === document.activeElement) return;

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
        event.preventDefault();
        const state = this.facade.getState();
        state.rotation = cycleRotation(state.rotation);
        this.syncGhost();
    }

    private handlePointerDown(event: PointerEvent) {
        if (!this.facade.isActive()) return;
        if (event.button !== 0) return;
        this.lastScreen = { x: event.clientX, y: event.clientY };
        if (this.facade.isOverUi(event.clientX, event.clientY)) {
            this.facade.ghost.clear();
            return;
        }

        const state = this.facade.getState();
        const world = this.facade.screenToWorld(event.clientX, event.clientY);
        const tx = clampTile(worldToTile(world.x));
        const ty = clampTile(worldToTile(world.y));

        if (state.tool === "place") {
            if (!state.selected) return;
            if (state.selected.kind === AdminPlaceKind.Ground) {
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
            this.beginStroke();
            this.syncGhost();
            this.applyAtScreen(event.clientX, event.clientY, true);
            return;
        }

        this.painting = true;
        this.groundDrag = null;
        this.lastTileKey = "";
        this.beginStroke();
        this.syncGhost();
        this.applyAtScreen(event.clientX, event.clientY, true);
    }

    private handlePointerUp(event: PointerEvent) {
        if (event.button !== 0) return;
        if (this.groundDrag) {
            this.finishGroundDrag();
            return;
        }
        this.painting = false;
        this.lastTileKey = "";
        this.endStroke();
    }

    private handlePointerMove(event: PointerEvent) {
        this.lastScreen = { x: event.clientX, y: event.clientY };
        if (!this.facade.isActive()) {
            this.painting = false;
            this.groundDrag = null;
            this.endStroke();
            this.facade.ghost.clear();
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
        const state = this.facade.getState();
        if (!state.drag) return;
        this.applyAtScreen(event.clientX, event.clientY, false);
    }

    private placeRotation(state: EditorState): TileRot {
        if (!state.randomRotation) return state.rotation;
        return random.integer(0, 3) as TileRot;
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
        });
    }

    private applyAtScreen(screenX: number, screenY: number, isClick: boolean) {
        const state = this.facade.getState();
        const world = this.facade.screenToWorld(screenX, screenY);
        const x = clampTile(worldToTile(world.x));
        const y = clampTile(worldToTile(world.y));
        const key = `${x},${y}`;

        if (!isClick && key === this.lastTileKey) return;
        if (!state.drag && !isClick) return;
        this.lastTileKey = key;

        if (state.tool === "delete") {
            this.sendPacket(ClientPacket.AdminDeleteAt, { x, y });
            return;
        }

        const selected = state.selected;
        if (!selected || selected.kind === AdminPlaceKind.Ground) return;

        const variantName = state.randomVariant
            ? random.choice([...listVariantNames()])
            : "base";
        let variant = 0;
        try {
            variant = getVariantId(variantName) ?? 0;
        } catch {
            variant = 0;
        }

        this.sendPacket(ClientPacket.AdminPlace, {
            kind: selected.kind,
            typeId: selected.id,
            x,
            y,
            rotation: this.placeRotation(state),
            variant,
            w: 1,
            h: 1,
        });
    }
}
