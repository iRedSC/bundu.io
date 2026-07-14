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
/** How quickly flying items ease toward their target. */
const FLY_LERP = 0.28;
/** World-drop travel — exponential, but slower than slot flies. */
const DROP_POS_LERP = 0.1;
const DROP_SCALE_LERP = 0.12;
const DROP_PEAK_SCALE = 1.55;
const DROP_END_SCALE = 0.3;
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

    tick() {
        tickItemButton(
            this,
            INVENTORY_COLORS,
            this.restY,
            this.selected ? 0.92 : 1
        );
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

type Fly = {
    view: InventoryButton;
    mode: "slot" | "pointer" | "drop";
    slot?: number;
    /** Fixed local target for drop flights. */
    tx?: number;
    ty?: number;
    /** Distance from start → player when the drop began. */
    startDist?: number;
    startScale?: number;
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
    /** Global/stage position where world drops should fly (e.g. local player). */
    getDropTargetGlobal?: () => { x: number; y: number } | null;

    private ghost = new InventoryButton();
    private flies: Fly[] = [];
    /** Slots waiting for a fly-in before showing their stack. */
    private settling = new Set<number>();

    private dragFrom: number | null = null;
    private dragging = false;
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

        inventoryGrid.arrange(this.buttons);
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

        if (this.dragFrom !== null && !this.dragging) {
            const dx = ev.clientX - this.dragStart.x;
            const dy = ev.clientY - this.dragStart.y;
            if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
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
                    const to = this.hoverSlot ?? -1;
                    this.finishDrag(from, to);
                    this.onMove?.(from, to);
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

    private dropTargetLocal(): { x: number; y: number } {
        const global = this.getDropTargetGlobal?.();
        if (!global) return this.pointerLocal();
        return this.container.toLocal(global);
    }

    private slotPos(slot: number): { x: number; y: number } {
        const btn = this.buttons[slot];
        return btn
            ? { x: btn.button.position.x, y: btn.button.position.y }
            : this.pointerLocal();
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
        // Count only hides on world-drop flights.
        if (mode === "drop") view.amount.text = "";
        view.button.visible = true;
        view.button.position.set(fromX, fromY);
        view.button.scale.set(fromScale || 1);
        this.container.addChild(view.button);

        if (mode === "slot" && slot !== undefined && hideSlot) {
            this.settling.add(slot);
            this.buttons[slot]?.setStack(null);
        }

        const fly: Fly = { view, mode, slot };
        if (mode === "drop") {
            const target = this.dropTargetLocal();
            fly.tx = target.x;
            fly.ty = target.y;
            fly.startScale = fromScale || 1;
            fly.startDist = Math.max(
                1,
                Math.hypot(fromX - target.x, fromY - target.y)
            );
        }
        this.flies.push(fly);
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
            // Dropped outside — fly toward the player / spawn point.
            this.startFly(fromStack, ghostX, ghostY, ghostScale, "drop");
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
            const dropped: ItemStack = [this.cursor[0], take];
            this.cursor = this.shrinkCursor(take);
            this.rebuildItemsMap();
            this.startFly(
                dropped,
                this.ghost.button.visible
                    ? this.ghost.button.position.x
                    : pointer.x,
                this.ghost.button.visible
                    ? this.ghost.button.position.y
                    : pointer.y,
                this.ghost.button.scale.x,
                "drop"
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

    tick() {
        for (const [slot, button] of this.buttons.entries()) {
            button.selected = slot === this.selectedSlot;
            button.tick();
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

        // Flying drops / swaps.
        for (let i = this.flies.length - 1; i >= 0; i--) {
            const fly = this.flies[i];
            if (!fly) continue;

            let tx = pointer.x;
            let ty = pointer.y;
            let ts = 1;

            if (fly.mode === "slot" && fly.slot !== undefined) {
                const pos = this.slotPos(fly.slot);
                tx = pos.x;
                ty = pos.y;
            } else if (fly.mode === "drop") {
                tx = fly.tx ?? pointer.x;
                ty = fly.ty ?? pointer.y;
                const dist = Math.hypot(
                    fly.view.button.position.x - tx,
                    fly.view.button.position.y - ty
                );
                const startDist = fly.startDist ?? dist;
                const t = Math.min(1, Math.max(0, 1 - dist / startDist));
                // Grow through the first third, then shrink into the player.
                if (t < 0.35) {
                    ts = lerp(
                        fly.startScale ?? 1,
                        DROP_PEAK_SCALE,
                        t / 0.35
                    );
                } else {
                    ts = lerp(
                        DROP_PEAK_SCALE,
                        DROP_END_SCALE,
                        (t - 0.35) / 0.65
                    );
                }
            }

            const v = fly.view.button;
            const posLerp = fly.mode === "drop" ? DROP_POS_LERP : FLY_LERP;
            const scaleLerp =
                fly.mode === "drop" ? DROP_SCALE_LERP : FLY_LERP;
            v.position.x = lerp(v.position.x, tx, posLerp);
            v.position.y = lerp(v.position.y, ty, posLerp);
            const s = lerp(v.scale.x, ts, scaleLerp);
            v.scale.set(s);

            const dx = v.position.x - tx;
            const dy = v.position.y - ty;
            const arrived =
                fly.mode === "drop"
                    ? dx * dx + dy * dy < FLY_SNAP * FLY_SNAP &&
                      v.scale.x < 0.5
                    : dx * dx + dy * dy < FLY_SNAP * FLY_SNAP &&
                      Math.abs(v.scale.x - ts) < 0.05;

            if (arrived) {
                this.flies.splice(i, 1);
                this.finishFly(fly);
            }
        }
    }

    resize() {
        this.container.position.set(
            percentOf(50, window.innerWidth) -
                percentOf(
                    50,
                    (ITEM_BUTTON_SIZE + percentOf(10, ITEM_BUTTON_SIZE)) *
                        (this.slotCount - 1)
                ),

            window.innerHeight -
                ITEM_BUTTON_SIZE / 2 -
                percentOf(10, ITEM_BUTTON_SIZE)
        );
    }
}
