import { Container, Text } from "pixi.js";
import { ItemButton, tickItemButton } from "./item_button";
import { prettifyNumber, percentOf, lerp } from "@bundu/shared";
import { TEXT_STYLE } from "@client/assets/text";
import { Grid } from "./grid";
import { ITEM_BUTTON_SIZE } from "../constants";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import {
    PlaceMode,
    MAX_STACK,
    amountForMode,
    placeModeFromModifiers,
    type PlaceMode as PlaceModeType,
} from "@bundu/shared/inventory";

type ItemStack = [id: number, amount: number];

const INVENTORY_COLORS = {
    empty: 0x222910,
    default: 0x4a5235,
    hover: 0x818f5d,
    down: 0x222910,
    rightDown: 0x818f5d,
} as const;

const DRAG_THRESHOLD = 8;
/** Columns per hotbar row - matches server `HOTBAR_SIZE`. */
const HOTBAR_COLUMNS = 10;
/**
 * If a drag never leaves this radius from the press, treat release as a select.
 * Dragging out and back does not count — once left, it's a real drag.
 */
const SELECT_DRAG_SLACK = 28;
/** How quickly flying items ease toward their target. */
const FLY_LERP = 0.28;
const FLY_SNAP = 3;

export class InventoryButton extends ItemButton {
    amount: Text;
    private restY: number;
    selected = false;

    constructor() {
        super();

        this.restY = this.background.position.y;
        this.amount = new Text({ text: "", style: TEXT_STYLE });
        this.amount.style.align = "left";
        this.amount.position.set(
            -this.background.width / 2,
            this.background.height / 2
        );
        this.amount.scale.set(0.45);
        this.amount.anchor.set(0, 1);
        this.amount.zIndex = 2;
        this.button.addChild(this.amount);
        this.button.sortChildren();
    }

    clear() {
        this.amount.text = "";
        this.item = null;
    }

    setStack(stack: ItemStack | null) {
        this.clear();
        if (!stack) return;
        const [itemId, amount] = stack;
        this.amount.text = prettifyNumber(amount);
        this.item = itemId;
    }

    tick(now?: number) {
        tickItemButton(
            this,
            INVENTORY_COLORS,
            this.restY,
            this.selected ? 0.92 : 1,
            now
        );
    }

    override destroy(): void {
        this.amount.destroy();
        super.destroy();
    }
}

const inventoryGrid = new Grid(
    percentOf(10, ITEM_BUTTON_SIZE),
    percentOf(10, ITEM_BUTTON_SIZE),
    ITEM_BUTTON_SIZE,
    ITEM_BUTTON_SIZE,
    1
);

type SelectCB = (slot: number) => void;
type MoveCB = (from: number, to: number) => void;
type CursorCB = (slot: number, mode: PlaceModeType) => void;
type WorldDropCB = (
    originGlobal: { x: number; y: number },
    buttonScale: number
) => void;

type Fly = {
    view: InventoryButton;
    mode: "slot" | "pointer";
    slot?: number;
};

/**
 * Hotbar UI: left-click selects, drag moves/swaps,
 * right-click drives the cursor stack.
 */
export class Inventory {
    container = new Container();
    buttons: InventoryButton[] = [];
    slots: (ItemStack | null)[] = [];
    cursor: ItemStack | null = null;
    items = new Map<number, number>();

    onSelect?: SelectCB;
    onMove?: MoveCB;
    onCursor?: CursorCB;
    /** When true, pointer/drag/cursor handlers skip local mutations. */
    isLocked?: () => boolean;
    /**
     * Local world drop — origin in global/stage space and current button scale.
     * The ground item animates from here; no UI fly.
     */
    onWorldDrop?: WorldDropCB;

    private ghost = new InventoryButton();
    private flies: Fly[] = [];
    /** Slots waiting for a fly-in before showing their stack. */
    private settling = new Set<number>();

    private dragFrom: number | null = null;
    private dragging = false;
    /** True once the pointer leaves SELECT_DRAG_SLACK — real drag, not a click. */
    private dragCommitted = false;
    /** Stack shown on the pointer during left-drag (not the server cursor). */
    private dragStack: ItemStack | null = null;
    private dragStart = { x: 0, y: 0 };
    private hoverSlot: number | null = null;
    private selectedSlot = 0;
    private lastPointer = { x: 0, y: 0 };

    constructor() {
        this.setupOverlay(this.ghost);
        this.ghost.button.zIndex = 1000;
        this.container.sortableChildren = true;
        this.container.addChild(this.ghost.button);

        this.slotCount = 0;

        window.addEventListener("pointermove", this.onWindowPointerMove);
        window.addEventListener("pointerup", this.onWindowPointerUp);
    }

    set slotCount(count: number) {
        const diff = count - this.buttons.length;

        if (diff > 0) {
            for (let i = 0; i < diff; i++) {
                const button = new InventoryButton();
                button.sendEvents = false;
                this.wireButton(button, this.buttons.length);
                this.buttons.push(button);
                this.container.addChild(button.button);
                this.slots.push(null);
            }
        }

        if (diff < 0) {
            for (let i = 0; i < -diff; i++) {
                const btn = this.buttons.pop();
                if (btn) this.container.removeChild(btn.button);
                btn?.destroy();
                this.slots.pop();
            }
        }

        this.selectedSlot = Math.min(this.selectedSlot, this.buttons.length - 1);

        const columns = Math.min(HOTBAR_COLUMNS, this.buttons.length) || 1;
        inventoryGrid.maxRows = Math.ceil(this.buttons.length / columns) || 1;
        inventoryGrid.arrangeRows(this.buttons, columns);
        this.container.addChild(this.ghost.button);
        for (const fly of this.flies) {
            this.container.addChild(fly.view.button);
        }
    }

    get slotCount() {
        return this.buttons.length;
    }

    /** True while over a slot, mid-drag, or holding a stack on the cursor. */
    get isInteracting(): boolean {
        return (
            this.hoverSlot !== null ||
            this.dragFrom !== null ||
            this.cursor !== null
        );
    }

    private setupOverlay(button: InventoryButton) {
        button.button.eventMode = "none";
        button.button.visible = false;
        button.background.visible = false;
        button.disableSprite.visible = false;
    }

    private locked(): boolean {
        return this.isLocked?.() ?? false;
    }

    private wireButton(button: InventoryButton, slot: number) {
        button.button.onpointerdown = (ev) => {
            if (this.locked()) return;
            this.lastPointer = { x: ev.clientX, y: ev.clientY };
            if (ev.button === 0) {
                this.dragFrom = slot;
                this.dragging = false;
                this.dragCommitted = false;
                this.dragStart = { x: ev.clientX, y: ev.clientY };
                button.down = true;
            } else if (ev.button === 2) {
                button.rightDown = true;
            }
        };

        button.button.onpointerenter = () => {
            button.hovering = true;
            this.hoverSlot = slot;
        };

        button.button.onpointerleave = () => {
            button.hovering = false;
            if (this.hoverSlot === slot) this.hoverSlot = null;
        };

        button.button.onpointerup = (ev) => {
            if (ev.button === 2) {
                if (!this.locked()) {
                    this.handleCursorSlot(
                        slot,
                        placeModeFromModifiers(
                            ev.shiftKey,
                            ev.ctrlKey || ev.metaKey
                        )
                    );
                }
                button.rightDown = false;
                button.down = false;
            }
        };
    }

    private onWindowPointerMove = (ev: PointerEvent) => {
        this.lastPointer = { x: ev.clientX, y: ev.clientY };

        if (this.locked()) return;

        if (this.dragFrom !== null) {
            const dx = ev.clientX - this.dragStart.x;
            const dy = ev.clientY - this.dragStart.y;
            const dist2 = dx * dx + dy * dy;

            if (
                !this.dragCommitted &&
                dist2 >= SELECT_DRAG_SLACK * SELECT_DRAG_SLACK
            ) {
                this.dragCommitted = true;
            }

            if (!this.dragging && dist2 >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
                this.dragging = true;
                const stack = this.slots[this.dragFrom];
                if (stack) {
                    this.dragStack = stack;
                    this.liftFromSlot(this.dragFrom, stack);
                }
            }
        }
    };

    private onWindowPointerUp = (ev: PointerEvent) => {
        if (this.locked()) {
            this.abortDrag();
            for (const button of this.buttons) {
                button.down = false;
                button.rightDown = false;
            }
            return;
        }

        if (ev.button === 2 && this.hoverSlot === null && this.cursor) {
            this.handleCursorSlot(
                -1,
                placeModeFromModifiers(ev.shiftKey, ev.ctrlKey || ev.metaKey)
            );
        }

        if (ev.button === 0) {
            if (this.cursor && !this.dragging) {
                const mode = ev.shiftKey ? PlaceMode.Half : PlaceMode.One;
                this.handleCursorSlot(this.hoverSlot ?? -1, mode);
                this.clearDrag();
            } else if (this.dragFrom !== null) {
                if (this.dragging) {
                    const from = this.dragFrom;
                    if (!this.dragCommitted) {
                        // Never left the click slack — treat as select.
                        if (this.dragStack) {
                            this.buttons[from]?.setStack(
                                this.slots[from] ?? null
                            );
                            this.syncGhostToCursor();
                        }
                        this.selectedSlot = from;
                        this.onSelect?.(from);
                    } else {
                        const to = this.hoverSlot ?? -1;
                        this.finishDrag(from, to);
                        this.onMove?.(from, to);
                    }
                } else {
                    this.selectedSlot = this.dragFrom;
                    this.onSelect?.(this.dragFrom);
                }
                this.clearDrag();
            }
        }

        for (const button of this.buttons) {
            button.down = false;
            button.rightDown = false;
        }
    };

    private clearDrag() {
        this.dragFrom = null;
        this.dragging = false;
        this.dragCommitted = false;
        this.dragStack = null;
    }

    /** Cancel an in-progress drag without mutating slots. */
    private abortDrag() {
        const from = this.dragFrom;
        if (from !== null && this.dragStack) {
            this.buttons[from]?.setStack(this.slots[from] ?? null);
            this.syncGhostToCursor();
        }
        this.clearDrag();
    }

    private pointerLocal(): { x: number; y: number } {
        return {
            x: this.lastPointer.x - this.container.position.x,
            y: this.lastPointer.y - this.container.position.y,
        };
    }

    private slotPos(slot: number): { x: number; y: number } {
        const btn = this.buttons[slot];
        return btn
            ? { x: btn.button.position.x, y: btn.button.position.y }
            : this.pointerLocal();
    }

    /** Hand a world drop off to the ground-item animation. */
    private emitWorldDrop(localX: number, localY: number, scale: number) {
        const global = this.container.toGlobal({ x: localX, y: localY });
        this.onWorldDrop?.(global, scale || 1);
    }

    private startFly(
        stack: ItemStack,
        fromX: number,
        fromY: number,
        fromScale: number,
        mode: Fly["mode"],
        slot?: number,
        hideSlot = true
    ) {
        const view = new InventoryButton();
        this.setupOverlay(view);
        view.button.zIndex = 1001;
        view.setStack(stack);
        view.button.visible = true;
        view.button.position.set(fromX, fromY);
        view.button.scale.set(fromScale || 1);
        this.container.addChild(view.button);

        if (mode === "slot" && slot !== undefined && hideSlot) {
            this.settling.add(slot);
            this.buttons[slot]?.setStack(null);
        }

        this.flies.push({ view, mode, slot });
    }

    private finishFly(fly: Fly) {
        if (fly.mode === "slot" && fly.slot !== undefined) {
            this.settling.delete(fly.slot);
            this.buttons[fly.slot]?.setStack(this.slots[fly.slot] ?? null);
        } else if (fly.mode === "pointer") {
            if (this.cursor) {
                this.ghost.setStack(this.cursor);
                this.ghost.button.visible = true;
                this.ghost.button.position.copyFrom(fly.view.button.position);
                this.ghost.button.scale.copyFrom(fly.view.button.scale);
                this.container.addChild(this.ghost.button);
            }
        }

        this.container.removeChild(fly.view.button);
        fly.view.destroy();
    }

    /**
     * Left-drag release: animate into the target slot, and if swapping,
     * animate the displaced stack back to the source.
     */
    private finishDrag(from: number, to: number) {
        const fromStack = this.slots[from];
        if (!fromStack) {
            this.syncGhostToCursor();
            return;
        }

        const ghostX = this.ghost.button.position.x;
        const ghostY = this.ghost.button.position.y;
        const ghostScale = this.ghost.button.scale.x;
        this.ghost.button.visible = false;

        if (to === from) {
            this.startFly(fromStack, ghostX, ghostY, ghostScale, "slot", from);
            return;
        }

        if (to < 0) {
            this.emitWorldDrop(ghostX, ghostY, ghostScale);
            this.slots[from] = null;
            this.rebuildItemsMap();
            this.buttons[from]?.setStack(null);
            return;
        }

        const toStack = this.slots[to] ?? null;
        this.slots[from] = toStack;
        this.slots[to] = fromStack;
        this.rebuildItemsMap();

        this.startFly(fromStack, ghostX, ghostY, ghostScale, "slot", to);
        if (toStack) {
            const dest = this.slotPos(to);
            this.startFly(toStack, dest.x, dest.y, 1, "slot", from);
        } else {
            this.buttons[from]?.setStack(null);
        }
    }

    /**
     * Cursor pick / place / swap with fly animations.
     */
    private handleCursorSlot(slot: number, mode: PlaceModeType) {
        if (this.locked()) return;
        const pointer = this.pointerLocal();

        // Pick up from slot into cursor.
        if (!this.cursor) {
            if (slot < 0) return;
            const stack = this.slots[slot];
            if (!stack) return;

            this.liftFromSlot(slot, stack);
            this.slots[slot] = null;
            this.cursor = stack;
            this.rebuildItemsMap();
            this.onCursor?.(slot, mode);
            return;
        }

        // Drop from cursor outside.
        if (slot < 0) {
            const take = amountForMode(this.cursor[1], mode);
            this.cursor = this.shrinkCursor(take);
            this.rebuildItemsMap();
            this.emitWorldDrop(
                this.ghost.button.visible
                    ? this.ghost.button.position.x
                    : pointer.x,
                this.ghost.button.visible
                    ? this.ghost.button.position.y
                    : pointer.y,
                this.ghost.button.scale.x
            );
            this.syncGhostToCursor();
            this.onCursor?.(slot, mode);
            return;
        }

        const target = this.slots[slot];
        const fromX = this.ghost.button.visible
            ? this.ghost.button.position.x
            : pointer.x;
        const fromY = this.ghost.button.visible
            ? this.ghost.button.position.y
            : pointer.y;
        const fromScale = this.ghost.button.scale.x;

        // Place onto empty slot.
        if (!target) {
            const take = amountForMode(this.cursor[1], mode);
            const placed: ItemStack = [this.cursor[0], take];
            this.slots[slot] = placed;
            this.cursor = this.shrinkCursor(take);
            this.rebuildItemsMap();
            this.startFly(placed, fromX, fromY, fromScale, "slot", slot);
            this.syncGhostToCursor();
            if (this.cursor) {
                this.ghost.button.position.set(fromX, fromY);
            }
            this.onCursor?.(slot, mode);
            return;
        }

        // Same item → merge (fly the placed amount into the slot).
        if (target[0] === this.cursor[0]) {
            const take = amountForMode(this.cursor[1], mode);
            const space = MAX_STACK - target[1];
            const add = Math.min(take, space, this.cursor[1]);
            if (add <= 0) {
                this.onCursor?.(slot, mode);
                return;
            }
            const flying: ItemStack = [this.cursor[0], add];
            this.slots[slot] = [target[0], target[1] + add];
            this.cursor = this.shrinkCursor(add);
            this.rebuildItemsMap();
            // Keep existing stack visible; fly is just the added amount.
            this.startFly(flying, fromX, fromY, fromScale, "slot", slot, false);
            this.syncGhostToCursor();
            if (this.cursor) {
                this.ghost.button.position.set(fromX, fromY);
            }
            this.onCursor?.(slot, mode);
            return;
        }

        // Different item → swap with crossed flies.
        const slotStack = target;
        const cursorStack = this.cursor;
        this.slots[slot] = cursorStack;
        this.cursor = slotStack;
        this.rebuildItemsMap();

        this.ghost.button.visible = false;
        this.buttons[slot]?.setStack(null);
        const dest = this.slotPos(slot);
        this.startFly(cursorStack, fromX, fromY, fromScale, "slot", slot);
        this.startFly(slotStack, dest.x, dest.y, 1, "pointer");
        this.onCursor?.(slot, mode);
    }

    private shrinkCursor(amount: number): ItemStack | null {
        if (!this.cursor) return null;
        const next = this.cursor[1] - amount;
        return next > 0 ? [this.cursor[0], next] : null;
    }

    /** Lift a slot stack onto the cursor ghost (pickup / drag start). */
    private liftFromSlot(slot: number, stack: ItemStack) {
        const btn = this.buttons[slot];
        if (!btn) return;

        this.ghost.setStack(stack);
        this.ghost.background.visible = false;
        this.ghost.disableSprite.visible = false;
        this.ghost.button.visible = true;
        this.ghost.button.position.set(
            btn.button.position.x,
            btn.button.position.y
        );
        this.ghost.button.scale.set(btn.button.scale.x, btn.button.scale.y);
        this.container.addChild(this.ghost.button);
        btn.setStack(null);
    }

    private syncGhostToCursor() {
        this.ghost.background.visible = false;
        this.ghost.disableSprite.visible = false;
        if (this.cursor) {
            this.ghost.setStack(this.cursor);
            this.ghost.button.visible = true;
            this.container.addChild(this.ghost.button);
        } else {
            this.ghost.button.visible = false;
        }
    }

    private rebuildItemsMap() {
        this.items.clear();
        for (const stack of this.slots) {
            if (!stack) continue;
            const [id, amount] = stack;
            this.items.set(id, (this.items.get(id) ?? 0) + amount);
        }
        if (this.cursor) {
            const [id, amount] = this.cursor;
            this.items.set(id, (this.items.get(id) ?? 0) + amount);
        }
    }

    private refreshSlotVisuals() {
        for (const [i, button] of this.buttons.entries()) {
            if (this.settling.has(i)) {
                button.setStack(null);
                continue;
            }
            if (this.dragStack && i === this.dragFrom) {
                button.setStack(null);
                continue;
            }
            button.setStack(this.slots[i] ?? null);
        }
    }

    update({ items, cursor }: ServerPacket.UpdateInventory) {
        this.slotCount = items.length;

        this.slots = Array(this.slotCount).fill(null);
        for (const [i, stack] of items.entries()) {
            this.slots[i] = stack;
        }
        this.cursor = cursor ?? null;
        this.rebuildItemsMap();
        this.refreshSlotVisuals();

        if (this.dragStack) {
            this.ghost.setStack(this.dragStack);
            this.ghost.background.visible = false;
            this.ghost.disableSprite.visible = false;
            this.ghost.button.visible = true;
            this.container.addChild(this.ghost.button);
        } else if (!this.flies.some((f) => f.mode === "pointer")) {
            // Don't snap the ghost while a swap-to-cursor fly is in progress.
            this.syncGhostToCursor();
        }
        this.resize();
    }

    tick(now?: number) {
        for (const [slot, button] of this.buttons.entries()) {
            button.selected = slot === this.selectedSlot;
            button.tick(now);
        }

        const pointer = this.pointerLocal();

        // Cursor / drag ghost follows the pointer.
        if (this.ghost.button.visible) {
            this.ghost.button.position.x = lerp(
                this.ghost.button.position.x,
                pointer.x,
                FLY_LERP
            );
            this.ghost.button.position.y = lerp(
                this.ghost.button.position.y,
                pointer.y,
                FLY_LERP
            );
            const scale = lerp(this.ghost.button.scale.x, 1, FLY_LERP);
            this.ghost.button.scale.set(scale);
        }

        // Flying swaps / slot settles.
        for (let i = this.flies.length - 1; i >= 0; i--) {
            const fly = this.flies[i];
            if (!fly) continue;

            let tx = pointer.x;
            let ty = pointer.y;

            if (fly.mode === "slot" && fly.slot !== undefined) {
                const pos = this.slotPos(fly.slot);
                tx = pos.x;
                ty = pos.y;
            }

            const v = fly.view.button;
            v.position.x = lerp(v.position.x, tx, FLY_LERP);
            v.position.y = lerp(v.position.y, ty, FLY_LERP);
            const s = lerp(v.scale.x, 1, FLY_LERP);
            v.scale.set(s);

            const dx = v.position.x - tx;
            const dy = v.position.y - ty;
            if (
                dx * dx + dy * dy < FLY_SNAP * FLY_SNAP &&
                Math.abs(v.scale.x - 1) < 0.05
            ) {
                this.flies.splice(i, 1);
                this.finishFly(fly);
            }
        }
    }

    destroy(): void {
        window.removeEventListener("pointermove", this.onWindowPointerMove);
        window.removeEventListener("pointerup", this.onWindowPointerUp);
        for (const button of this.buttons) button.destroy();
        for (const fly of this.flies) fly.view.destroy();
        this.ghost.destroy();
        this.buttons.length = 0;
        this.flies.length = 0;
        this.container.destroy({ children: false });
    }

    resize() {
        const columns = Math.min(HOTBAR_COLUMNS, this.slotCount) || 1;
        const rows = Math.ceil(this.slotCount / columns) || 1;
        const cell = ITEM_BUTTON_SIZE + percentOf(10, ITEM_BUTTON_SIZE);
        this.container.position.set(
            percentOf(50, window.innerWidth) -
                percentOf(50, cell * (columns - 1)),
            window.innerHeight -
                ITEM_BUTTON_SIZE / 2 -
                percentOf(10, ITEM_BUTTON_SIZE) -
                cell * (rows - 1)
        );
    }
}
