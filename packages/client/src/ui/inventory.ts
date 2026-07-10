import { Container, Text } from "pixi.js";
import { ItemButton, tickItemButton } from "./item_button";
import { prettifyNumber, percentOf } from "@bundu/shared";
import { TEXT_STYLE } from "@client/assets/text";
import { Grid } from "./grid";
import { ITEM_BUTTON_SIZE } from "../constants";
import type { ServerPacket } from "@bundu/shared/packet_definitions";

/**
 * Ah yes the inventory, not looking so good rn
 * I'm going to try to get is nice and cleaned up soon enough.
 */

type ItemStack = [id: number, amount: number];

const INVENTORY_COLORS = {
    empty: 0x222910,
    default: 0x4a5235,
    hover: 0x818f5d,
    down: 0x222910,
    rightDown: 0xb54731,
} as const;

/**
 * The InventoryButton is what makes up the hotbar.
 * It can be clicked to select the item in it's slot,
 * or you can drag the item to a new slot to rearrange.
 */
export class InventoryButton extends ItemButton {
    amount: Text;
    private restY: number;

    constructor() {
        super();

        this.restY = this.background.position.y;
        this.amount = new Text({ text: "", style: TEXT_STYLE });
        this.amount.style.align = "right";
        this.amount.position.set(
            this.background.width / 2,
            this.background.height / 2
        );
        this.amount.scale.set(0.45);
        this.amount.anchor.set(1);
        this.amount.zIndex = 2;
        this.button.addChild(this.amount);
        this.button.sortChildren();
    }

    clear() {
        this.amount.text = "";
        this.item = null;
    }

    /** Tween hover/press/empty visuals from interaction state. */
    tick() {
        tickItemButton(this, INVENTORY_COLORS, this.restY);
    }
}

/**
 * The inventory, where all of your item data is stored.
 */

type Callback = (item: number, shift: boolean) => void;

const inventoryGrid = new Grid(
    percentOf(10, ITEM_BUTTON_SIZE),
    percentOf(10, ITEM_BUTTON_SIZE),
    ITEM_BUTTON_SIZE,
    ITEM_BUTTON_SIZE,
    1
);

/**
 * The display side of the inventory, holds all of the buttons.
 */
export class Inventory {
    container = new Container();
    buttons: InventoryButton[] = [];
    slots: (ItemStack | null)[] = [];
    items = new Map<number, number>();
    private rightClickCB?: Callback;
    private leftClickCB?: Callback;

    constructor() {
        this.slotCount = 0;
    }

    /**
     * Change the slot count of the display
     * @param count Number of slots to display
     */
    set slotCount(count: number) {
        const diff = count - this.buttons.length;

        // add slots
        if (diff > 0) {
            for (let i = 0; i < diff; i++) {
                const button = new InventoryButton();
                button.leftclick = this.leftClickCB;
                button.rightclick = this.rightClickCB;

                button.button.onpointerdown = (ev) => {
                    if (ev?.button === 2) button.rightDown = true;
                    button.down = true;
                };

                this.buttons.push(button);
                this.container.addChild(button.button);
                this.slots.push(null);
            }
        }

        // remove slots
        if (diff < 0) {
            for (let i = 0; i < -diff; i++) {
                const btn = this.buttons.pop();
                if (btn) this.container.removeChild(btn.button);
                btn?.destroy();
                this.slots.pop();
            }
        }

        inventoryGrid.arrange(this.buttons);
    }

    get slotCount() {
        return this.buttons.length;
    }

    set leftclick(value: Callback) {
        this.leftClickCB = value;
        this.buttons.forEach((b) => (b.leftclick = value));
    }

    set rightclick(value: Callback) {
        this.rightClickCB = value;
        this.buttons.forEach((b) => (b.rightclick = value));
    }

    update({ items }: ServerPacket.UpdateInventory) {
        this.slotCount = items.length;

        this.slots = Array(this.slotCount).fill(null);
        this.items.clear();
        for (const [i, stack] of items.entries()) {
            if (stack) {
                const [id, amount] = stack;
                const itemCount = this.items.get(id) ?? 0;
                this.items.set(id, itemCount + amount);
            }
            this.slots[i] = stack;
        }

        for (const [i, button] of this.buttons.entries()) {
            button.clear();
            const item = this.slots[i];
            if (!item) continue;
            const [itemId, amount] = item;
            button.amount.text = prettifyNumber(amount);
            button.item = itemId;
        }
        this.resize();
    }

    tick() {
        for (const button of this.buttons) {
            button.tick();
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
