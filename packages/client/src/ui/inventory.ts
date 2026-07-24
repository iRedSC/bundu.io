import { Container, Text } from "pixi.js";
import { ItemButton, tickItemButton, type ItemLockVisual, LOCK_FLASH_MS, formatItemLockTooltip, mergeItemLockVisuals } from "./item_button";
import { prettifyNumber, percentOf, lerp } from "@bundu/shared";
import {
    LOCK_ANY_ITEM,
    lockFlagsHas,
    lockSlotFlagsHas,
    lockSlotForItemFunction,
    mootEquipLockFlags,
    type LockAction,
    type LockSlot,
} from "@bundu/shared/item_lock";
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
import { clientItemMeta, clientRegistries } from "../configs/registries";
import { tooltipCopy } from "../lang/lang";
import {
    hideRegistryTooltip,
    moveRegistryTooltip,
} from "./registry_tooltip";
import { showTooltip } from "./tooltip";

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
        if (!stack) {
            this.setItemLock(null);
            return;
        }
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
        this.tickLock(now);
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

type SelectCB = (slot: number) => boolean;
type MoveCB = (from: number, to: number) => void;
type CursorCB = (slot: number, mode: PlaceModeType) => void;
type WorldDropCB = (
    originGlobal: { x: number; y: number },
    buttonScale: number
) => void;
/** Void cursor (`slot === -1`) or an inventory slot (creative sidebar drop). */
type VoidCB = (slot: number) => void;

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
    /** Active item lock rules (item-specific and/or slot-only). */
    private itemLocks: ItemLockVisual[] = [];
    /** Numeric equipment ids for the local player (from UpdateEquipment). */
    private equipped = {
        mainHand: -1,
        offHand: -1,
        helmet: -1,
    };
    /** Fired when a denied use/craft should flash the above-name lock gauge. */
    onLockFlash?: (lock: ItemLockVisual) => void;
    /** Fired after authoritative lock state is replaced (crafting menu sync). */
    onLocksChanged?: () => void;

    onSelect?: SelectCB;
    onMove?: MoveCB;
    onCursor?: CursorCB;
    /**
     * Creative: destroy cursor / slot instead of world-dropping.
     * Called when a drop lands on `isVoidTarget`.
     */
    onVoid?: VoidCB;
    /**
     * Creative: screen-space hit test for the creative sidebar (void zone).
     */
    isVoidTarget?: (screenX: number, screenY: number) => boolean;
    /**
     * Creative: placing a *creative-palette* cursor onto an occupied slot
     * replaces (destroys) the old item instead of swapping. Inventory↔inventory
     * moves always swap — see `cursorFromCreative`.
     */
    creativeReplace?: () => boolean;
    /** True while the held cursor stack was picked from the creative palette. */
    private cursorFromCreative = false;
    /** When true, pointer/drag/cursor handlers skip local mutations. */
    isLocked?: () => boolean;
    /** Freecam: ignore pointer hit-tests so world clicks pass through the ghost HUD. */
    private pointerMuted = false;
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
    /** Next ghost tick jumps to the pointer (no lerp from last drop). */
    private snapGhost = false;

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
                if (this.pointerMuted) button.button.eventMode = "none";
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
        if (this.pointerMuted) return false;
        return (
            this.hoverSlot !== null ||
            this.dragFrom !== null ||
            this.cursor !== null
        );
    }

    /** Mute slot hit-testing (freecam ghost HUD) without hiding the bar. */
    setPointerMuted(muted: boolean) {
        this.pointerMuted = muted;
        for (const button of this.buttons) {
            button.button.eventMode = muted ? "none" : "static";
            button.hovering = false;
            button.down = false;
            button.rightDown = false;
        }
        this.hoverSlot = null;
        hideRegistryTooltip();
        if (muted) this.clearDrag();
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

    private tipForSlot(slot: number, screenX: number, screenY: number) {
        // Only suppress while actually dragging / holding a cursor stack —
        // `dragFrom` is set on pointerdown before the drag threshold.
        if (this.dragging || this.cursor) {
            hideRegistryTooltip();
            return;
        }
        const itemId = this.slots[slot]?.[0] ?? this.buttons[slot]?.item;
        if (itemId == null) {
            hideRegistryTooltip();
            return;
        }
        const copy = tooltipCopy(
            "item",
            clientRegistries().item.location(itemId)
        );
        const lock = this.getLock(itemId);
        if (lock) {
            const lockLine = formatItemLockTooltip(lock);
            copy.body = copy.body ? `${copy.body}\n${lockLine}` : lockLine;
        }
        showTooltip(copy, screenX, screenY);
    }

    private wireButton(button: InventoryButton, slot: number) {
        button.button.onpointerdown = (ev) => {
            if (this.locked()) return;
            this.lastPointer = { x: ev.clientX, y: ev.clientY };
            hideRegistryTooltip();
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

        button.button.onpointerenter = (ev) => {
            button.hovering = true;
            this.hoverSlot = slot;
            this.tipForSlot(slot, ev.global.x, ev.global.y);
        };

        button.button.onpointermove = (ev) => {
            if (!button.hovering) return;
            if (this.dragging || this.cursor) {
                hideRegistryTooltip();
                return;
            }
            moveRegistryTooltip(ev.global.x, ev.global.y);
        };

        button.button.onpointerleave = () => {
            button.hovering = false;
            if (this.hoverSlot === slot) this.hoverSlot = null;
            hideRegistryTooltip();
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
                hideRegistryTooltip();
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
            if (this.isVoidTarget?.(ev.clientX, ev.clientY)) {
                this.voidCursorLocal();
                this.onVoid?.(-1);
            } else {
                this.handleCursorSlot(
                    -1,
                    placeModeFromModifiers(
                        ev.shiftKey,
                        ev.ctrlKey || ev.metaKey
                    )
                );
            }
        }

        if (ev.button === 0) {
            if (this.cursor && !this.dragging) {
                if (
                    this.hoverSlot === null &&
                    this.isVoidTarget?.(ev.clientX, ev.clientY)
                ) {
                    this.voidCursorLocal();
                    this.onVoid?.(-1);
                } else {
                    const mode = ev.shiftKey ? PlaceMode.Half : PlaceMode.One;
                    this.handleCursorSlot(this.hoverSlot ?? -1, mode);
                }
                this.clearDrag();
            } else if (this.dragFrom !== null) {
                if (this.dragging) {
                    const from = this.dragFrom;
                    if (!this.dragCommitted) {
                        // Never left the click slack — treat as select.
                        if (this.dragStack) {
                            const stack = this.slots[from] ?? null;
                            const button = this.buttons[from];
                            if (button) {
                                button.setStack(stack);
                                this.applyLockVisual(button, stack?.[0]);
                            }
                            this.syncGhostToCursor();
                        }
                        if (this.onSelect?.(from) !== false) {
                            this.selectedSlot = from;
                        }
                    } else if (
                        this.hoverSlot === null &&
                        this.isVoidTarget?.(ev.clientX, ev.clientY)
                    ) {
                        // Drag into creative sidebar → delete the source stack.
                        this.slots[from] = null;
                        this.buttons[from]?.setStack(null);
                        this.rebuildItemsMap();
                        this.syncGhostToCursor();
                        this.onVoid?.(from);
                    } else {
                        const to = this.hoverSlot ?? -1;
                        if (this.finishDrag(from, to)) {
                            this.onMove?.(from, to);
                        }
                    }
                } else {
                    if (this.onSelect?.(this.dragFrom) !== false) {
                        this.selectedSlot = this.dragFrom;
                    }
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
            const stack = this.slots[from] ?? null;
            const button = this.buttons[from];
            if (button) {
                button.setStack(stack);
                this.applyLockVisual(button, stack?.[0]);
            }
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
            const stack = this.slots[fly.slot] ?? null;
            const button = this.buttons[fly.slot];
            if (button) {
                button.setStack(stack);
                this.applyLockVisual(button, stack?.[0]);
            }
        } else if (fly.mode === "pointer") {
            if (this.cursor) {
                this.ghost.setStack(this.cursor);
                this.applyLockVisual(this.ghost, this.cursor[0]);
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
    private finishDrag(from: number, to: number): boolean {
        const fromStack = this.slots[from];
        if (!fromStack) {
            this.syncGhostToCursor();
            return false;
        }

        const ghostX = this.ghost.button.position.x;
        const ghostY = this.ghost.button.position.y;
        const ghostScale = this.ghost.button.scale.x;
        this.ghost.button.visible = false;

        if (to === from) {
            this.startFly(fromStack, ghostX, ghostY, ghostScale, "slot", from);
            return true;
        }

        if (to < 0) {
            if (this.denyAction(fromStack[0], "drop")) {
                this.startFly(
                    fromStack,
                    ghostX,
                    ghostY,
                    ghostScale,
                    "slot",
                    from
                );
                return false;
            }
            this.emitWorldDrop(ghostX, ghostY, ghostScale);
            this.slots[from] = null;
            this.rebuildItemsMap();
            this.buttons[from]?.setStack(null);
            return true;
        }

        // Inventory↔inventory drag always swaps — creative replace only applies
        // when placing a palette-originated cursor (handleCursorSlot).
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
        return true;
    }

    private voidCursorLocal() {
        this.cursor = null;
        this.cursorFromCreative = false;
        this.rebuildItemsMap();
        this.syncGhostToCursor();
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
            this.cursorFromCreative = false;
            this.rebuildItemsMap();
            this.onCursor?.(slot, mode);
            return;
        }

        // Drop from cursor outside.
        if (slot < 0) {
            if (this.denyAction(this.cursor[0], "drop")) {
                this.syncGhostToCursor();
                return;
            }
            const take = amountForMode(this.cursor[1], mode);
            this.cursor = this.shrinkCursor(take);
            if (!this.cursor) this.cursorFromCreative = false;
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
            if (!this.cursor) this.cursorFromCreative = false;
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
            if (!this.cursor) this.cursorFromCreative = false;
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

        // Different item → swap, or creative-palette replace (destroy target).
        const slotStack = target;
        const cursorStack = this.cursor;
        if (this.cursorFromCreative && this.creativeReplace?.()) {
            this.slots[slot] = cursorStack;
            this.cursor = null;
            this.cursorFromCreative = false;
            this.rebuildItemsMap();
            this.ghost.button.visible = false;
            this.buttons[slot]?.setStack(null);
            this.startFly(cursorStack, fromX, fromY, fromScale, "slot", slot);
            this.syncGhostToCursor();
            this.onCursor?.(slot, mode);
            return;
        }

        this.slots[slot] = cursorStack;
        this.cursor = slotStack;
        this.cursorFromCreative = false;
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
            this.applyLockVisual(this.ghost, this.cursor[0]);
            this.ghost.button.visible = true;
            this.container.addChild(this.ghost.button);
        } else {
            this.ghost.setItemLock(null);
            this.ghost.button.visible = false;
            this.snapGhost = false;
        }
    }

    /** Next cursor sync jumps to the pointer (creative pick / no fly-in). */
    armCursorSnap(): void {
        this.snapGhost = true;
    }

    /**
     * Optimistic creative pick — show the cursor immediately so a drag-release
     * in the same gesture can place/void without waiting for the server round-trip.
     */
    adoptCursor(stack: [id: number, amount: number], snap = true): void {
        this.cursor = stack;
        this.cursorFromCreative = true;
        this.rebuildItemsMap();
        this.syncGhostToCursor();
        if (snap) this.snapCursorGhostToPointer();
    }

    /** Jump the cursor ghost to the pointer immediately (no fly-in). */
    snapCursorGhostToPointer(): void {
        this.snapGhost = true;
        if (!this.cursor) return;
        const pointer = this.pointerLocal();
        this.ghost.background.visible = false;
        this.ghost.disableSprite.visible = false;
        this.ghost.setStack(this.cursor);
        this.ghost.button.visible = true;
        this.ghost.button.position.set(pointer.x, pointer.y);
        this.ghost.button.scale.set(1);
        this.container.addChild(this.ghost.button);
    }

    /** Right edge of the hotbar in screen space (for mode-control stacking). */
    hotbarRightEdge(): number {
        const columns = Math.min(HOTBAR_COLUMNS, this.buttons.length) || 1;
        const cell = ITEM_BUTTON_SIZE + percentOf(10, ITEM_BUTTON_SIZE);
        // container.x is the center of column 0; last column is at +(columns-1)*cell.
        return (
            this.container.position.x +
            cell * (columns - 1) +
            ITEM_BUTTON_SIZE / 2
        );
    }

    hotbarBaselineY(): number {
        return this.container.position.y;
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
            this.applyLockVisual(button, this.slots[i]?.[0]);
        }
    }

    private applyLockVisual(
        button: InventoryButton,
        itemId: number | undefined
    ) {
        if (itemId === undefined) {
            button.setItemLock(null);
            return;
        }
        const lock = this.displayLockForItem(itemId);
        if (!lock) {
            button.setItemLock(null);
            return;
        }
        button.setItemLock(lock, this.shouldShowPersistentLock(itemId, lock));
    }

    /**
     * Lock visual for UI: drop equip/unequip flags that don't apply to the
     * current equipped state (e.g. no equip lock badge while already equipped).
     */
    private displayLockForItem(itemId: number): ItemLockVisual | undefined {
        const lock = this.findLockForItem(itemId);
        if (!lock) return undefined;
        const flags = mootEquipLockFlags(lock.flags, this.isEquipped(itemId));
        if (flags === 0) return undefined;
        if (flags === lock.flags) return lock;
        return { ...lock, flags };
    }

    private isEquipped(itemId: number): boolean {
        return (
            this.equipped.mainHand === itemId ||
            this.equipped.offHand === itemId ||
            this.equipped.helmet === itemId
        );
    }

    private equippedSlotOf(itemId: number): LockSlot | undefined {
        if (this.equipped.mainHand === itemId) return "mainhand";
        if (this.equipped.offHand === itemId) return "offhand";
        if (this.equipped.helmet === itemId) return "helmet";
        return undefined;
    }

    private isEquippedInSlots(itemId: number, slotFlags: number): boolean {
        if (
            lockSlotFlagsHas(slotFlags, "mainhand") &&
            this.equipped.mainHand === itemId
        ) {
            return true;
        }
        if (
            lockSlotFlagsHas(slotFlags, "offhand") &&
            this.equipped.offHand === itemId
        ) {
            return true;
        }
        if (
            lockSlotFlagsHas(slotFlags, "helmet") &&
            this.equipped.helmet === itemId
        ) {
            return true;
        }
        return false;
    }

    private targetSlotForItem(itemId: number): LockSlot | undefined {
        return (
            this.equippedSlotOf(itemId) ??
            lockSlotForItemFunction(clientItemMeta(itemId).function)
        );
    }

    private ruleMatches(
        lock: ItemLockVisual,
        itemId: number,
        slot?: LockSlot
    ): boolean {
        if (lock.itemId !== LOCK_ANY_ITEM && lock.itemId !== itemId) {
            return false;
        }
        if (slot !== undefined) {
            return lockSlotFlagsHas(lock.slotFlags, slot);
        }
        // Drop / craft: item-scoped locks match by type; slot-only needs equipped.
        if (lock.itemId !== LOCK_ANY_ITEM) return true;
        return this.isEquippedInSlots(itemId, lock.slotFlags);
    }

    /**
     * Collapse overlapping rules into one visual: flags OR'd, timer = latest
     * expiry (with that rule's authored duration for the wipe gauge).
     */
    private mergeLocks(
        locks: readonly ItemLockVisual[]
    ): ItemLockVisual | undefined {
        return mergeItemLockVisuals(locks);
    }

    /**
     * Merged craft lock across recipe ingredient ids (latest expiry wins).
     * Does not consider the recipe result.
     */
    craftLockForIngredients(
        itemIds: Iterable<number>
    ): ItemLockVisual | undefined {
        const matched: ItemLockVisual[] = [];
        for (const rawId of itemIds) {
            const itemId = Number(rawId);
            const lock = this.findLock(itemId, "craft");
            if (lock) matched.push(lock);
        }
        return this.mergeLocks(matched);
    }

    private findLock(
        itemId: number,
        action: LockAction,
        slot?: LockSlot
    ): ItemLockVisual | undefined {
        const id = Number(itemId);
        const matched: ItemLockVisual[] = [];
        for (const lock of this.itemLocks) {
            if (!lockFlagsHas(lock.flags, action)) continue;
            if (this.ruleMatches(lock, id, slot)) matched.push(lock);
        }
        return this.mergeLocks(matched);
    }

    /** Effective lock on a hotbar stack (all overlapping rules merged). */
    private findLockForItem(itemId: number): ItemLockVisual | undefined {
        const slot = this.targetSlotForItem(itemId);
        const matched: ItemLockVisual[] = [];
        for (const lock of this.itemLocks) {
            if (this.ruleMatches(lock, itemId, slot)) {
                matched.push(lock);
                continue;
            }
            // Surface item-specific locks even when slot filter wouldn't match
            // the item's equip slot (e.g. craft/drop-only rules).
            if (lock.itemId === itemId) matched.push(lock);
        }
        return this.mergeLocks(matched);
    }

    /** Persistent slot lock when equip/unequip/drop currently applies. */
    private shouldShowPersistentLock(
        itemId: number,
        lock: ItemLockVisual
    ): boolean {
        const equipped = this.isEquipped(itemId);
        const slot = this.targetSlotForItem(itemId);
        if (
            lockFlagsHas(lock.flags, "equip") &&
            !equipped &&
            (slot === undefined || lockSlotFlagsHas(lock.slotFlags, slot))
        ) {
            return true;
        }
        if (
            lockFlagsHas(lock.flags, "unequip") &&
            equipped &&
            (slot === undefined || lockSlotFlagsHas(lock.slotFlags, slot))
        ) {
            return true;
        }
        if (lockFlagsHas(lock.flags, "drop") && this.ruleMatches(lock, itemId)) {
            return true;
        }
        return false;
    }

    get equippedMainHand(): number | undefined {
        return this.equipped.mainHand >= 0 ? this.equipped.mainHand : undefined;
    }

    get equippedOffHand(): number | undefined {
        return this.equipped.offHand >= 0 ? this.equipped.offHand : undefined;
    }

    get equippedHelmet(): number | undefined {
        return this.equipped.helmet >= 0 ? this.equipped.helmet : undefined;
    }

    setEquipment(mainhand: number, offhand: number, helmet: number) {
        this.equipped = {
            mainHand: mainhand >= 0 ? mainhand : -1,
            offHand: offhand >= 0 ? offhand : -1,
            helmet: helmet >= 0 ? helmet : -1,
        };
        for (const [i, button] of this.buttons.entries()) {
            this.applyLockVisual(button, this.slots[i]?.[0] ?? undefined);
        }
        if (this.cursor) {
            this.applyLockVisual(this.ghost, this.cursor[0]);
        }
        this.onLocksChanged?.();
    }

    reconcileSelection(selected: number): void {
        if (selected < 0 || selected >= this.buttons.length) return;
        this.selectedSlot = selected;
    }

    getLock(
        itemId: number,
        action?: LockAction
    ): ItemLockVisual | undefined {
        if (action) return this.findLock(itemId, action);
        return this.displayLockForItem(itemId);
    }

    isActionLocked(
        itemId: number | undefined,
        action: LockAction,
        slot?: LockSlot
    ): boolean {
        if (itemId === undefined || itemId < 0) return false;
        return this.findLock(itemId, action, slot) !== undefined;
    }

    /**
     * Flash lock UI for a denied action. Returns true when the action is locked.
     */
    denyAction(
        itemId: number | undefined,
        action: LockAction,
        slot?: LockSlot
    ): boolean {
        if (itemId === undefined || itemId < 0) return false;
        const resolvedSlot = slot ?? this.targetSlotForItem(itemId);
        const lock = this.findLock(itemId, action, resolvedSlot);
        if (!lock) return false;
        this.flashItemLock(itemId, lock);
        return true;
    }

    /**
     * If selecting `itemId` would toggle equip/unequip against a lock, flash and
     * return true (caller should still send SelectItem — server is authoritative).
     *
     * Swapping into an occupied slot requires unequipping the current item first.
     */
    notifySelectDenied(itemId: number | undefined): boolean {
        if (itemId === undefined) return false;
        const slot = this.targetSlotForItem(itemId);
        if (this.isEquipped(itemId)) {
            return this.denyAction(itemId, "unequip", slot);
        }
        const current = this.equippedInSlot(slot);
        if (
            current !== undefined &&
            current !== itemId &&
            this.denyAction(current, "unequip", slot)
        ) {
            return true;
        }
        return this.denyAction(itemId, "equip", slot);
    }

    private equippedInSlot(slot: LockSlot | undefined): number | undefined {
        if (slot === "mainhand") return this.equippedMainHand;
        if (slot === "offhand") return this.equippedOffHand;
        if (slot === "helmet") return this.equippedHelmet;
        return undefined;
    }

    /** Flash matching hotbar slots + optional above-name gauge. */
    flashItemLock(itemId: number, lock?: ItemLockVisual) {
        const visual = lock ?? this.findLockForItem(itemId);
        if (!visual) return;
        for (const [i, button] of this.buttons.entries()) {
            if (this.slots[i]?.[0] === itemId) button.flashLock(LOCK_FLASH_MS);
        }
        if (this.cursor?.[0] === itemId) {
            this.ghost.flashLock(LOCK_FLASH_MS);
        }
        this.onLockFlash?.(visual);
    }

    /**
     * Apply authoritative item locks.
     * `remainingMs === -1` → permanent until unlockItem.
     * `itemId === -1` → slot-only (any item in those slots).
     */
    updateLocks(locks: ServerPacket.UpdateItemLocks["locks"]) {
        const now = performance.now();
        this.itemLocks = locks.map((entry) => {
            const itemId = Number(entry[0]);
            const remainingMs = Number(entry[1]);
            const durationMs = Number(entry[2]);
            const flags = Number(entry[3]);
            const slotFlags = Number(entry[4] ?? 0);
            return {
                itemId,
                endsAt:
                    remainingMs < 0
                        ? Number.POSITIVE_INFINITY
                        : now + remainingMs,
                durationMs: Math.max(0, durationMs),
                flags,
                slotFlags,
            };
        });
        for (const [i, button] of this.buttons.entries()) {
            this.applyLockVisual(button, this.slots[i]?.[0] ?? undefined);
        }
        if (this.cursor) {
            this.applyLockVisual(this.ghost, this.cursor[0]);
        }
        this.onLocksChanged?.();
    }

    update({ items, cursor }: ServerPacket.UpdateInventory) {
        this.slotCount = items.length;

        this.slots = Array(this.slotCount).fill(null);
        for (const [i, stack] of items.entries()) {
            this.slots[i] = stack;
        }
        this.cursor = cursor ?? null;
        // Server sync does not carry palette-origin; keep the local flag while a
        // cursor remains, and clear it when the cursor is gone.
        if (!this.cursor) this.cursorFromCreative = false;
        this.rebuildItemsMap();
        this.refreshSlotVisuals();

        if (this.hoverSlot !== null) {
            this.tipForSlot(
                this.hoverSlot,
                this.lastPointer.x,
                this.lastPointer.y
            );
        }

        if (this.dragStack) {
            this.ghost.setStack(this.dragStack);
            this.ghost.background.visible = false;
            this.ghost.disableSprite.visible = false;
            this.ghost.button.visible = true;
            this.container.addChild(this.ghost.button);
        } else if (!this.flies.some((f) => f.mode === "pointer")) {
            // Don't snap the ghost while a swap-to-cursor fly is in progress.
            this.syncGhostToCursor();
            // Creative pick arms snap so we don't lerp from the last drop point.
            if (this.cursor && this.snapGhost) {
                this.snapCursorGhostToPointer();
            }
        }
        this.resize();
    }

    tick(now?: number) {
        const t = now ?? performance.now();
        const before = this.itemLocks.length;
        this.itemLocks = this.itemLocks.filter(
            (lock) =>
                lock.endsAt === Number.POSITIVE_INFINITY || t < lock.endsAt
        );
        if (this.itemLocks.length !== before) {
            for (const [i, button] of this.buttons.entries()) {
                this.applyLockVisual(button, this.slots[i]?.[0] ?? undefined);
            }
            this.onLocksChanged?.();
        }
        for (const [slot, button] of this.buttons.entries()) {
            button.selected = slot === this.selectedSlot;
            button.tick(t);
        }

        const pointer = this.pointerLocal();

        // Cursor / drag ghost follows the pointer.
        if (this.ghost.button.visible) {
            if (this.snapGhost) {
                this.ghost.button.position.set(pointer.x, pointer.y);
                this.ghost.button.scale.set(1);
                this.snapGhost = false;
            } else {
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
        hideRegistryTooltip();
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
        const cell = ITEM_BUTTON_SIZE + percentOf(10, ITEM_BUTTON_SIZE);
        // Bottom-anchor the first row only — extra rows grow upward in arrangeRows.
        this.container.position.set(
            percentOf(50, window.innerWidth) -
                percentOf(50, cell * (columns - 1)),
            window.innerHeight -
                ITEM_BUTTON_SIZE / 2 -
                percentOf(10, ITEM_BUTTON_SIZE)
        );
    }
}
