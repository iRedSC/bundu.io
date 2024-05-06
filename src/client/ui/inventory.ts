import * as PIXI from "pixi.js";
import { ItemButton } from "./item_button";
import { prettifyNumber } from "../../lib/transforms";
import { TEXT_STYLE } from "../assets/text";
import { SpriteFactory } from "../assets/sprite_factory";
import { SCHEMA } from "../../shared/enums";
import { Grid } from "./grid";
import { percentOf } from "../../lib/math";

/**
 * Ah yes the inventory, not looking so good rn
 * I'm going to try to get is nice and cleaned up soon enough.
 */

type Item = [id: number, amount: number];

/**
 * The InventoryButton is what makes up the hotbar.
 * It can be clicked to select the item in it's slot,
 * or you can drag the item to a new slot to rearrange.
 */
export class InventoryButton extends ItemButton {
    amount: PIXI.Text;
    constructor() {
        super();
        this.amount = new PIXI.Text("", TEXT_STYLE);
        this.amount.position.set(55, 65);
        this.amount.scale.set(0.4);
        this.amount.anchor.set(1, 0.5);
        this.amount.zIndex = 2;
        this.button.addChild(this.amount);
        this.button.sortChildren();
    }
}

/**
 * The inventory, where all of your item data is stored.
 */

type Callback = (item: number) => void;
export class Inventory {
    slots: Item[];
    display: InventoryDisplay;

    constructor() {
        this.slots = [];
        this.display = new InventoryDisplay(this);
    }

    update(update: SCHEMA.SERVER.UPDATE_INVENTORY) {
        this.display.slotCount(update[0]);

        console.log(update);
        for (const [id, amount] of update[1]) {
            if (typeof id !== "number" || typeof amount !== "number") {
                continue;
            }
            let exists = false;
            for (const item of this.slots) {
                if (item === undefined) {
                    this.slots.splice(this.slots.indexOf(item), 1);
                }
                if (item[0] === id) {
                    item[1] = amount;
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                this.slots.push([id, amount]);
            }
        }
        this.slots = this.slots.filter((item) =>
            update[1].some((i) => i[0] === item[0])
        );
        this.display.update(this.slots);
    }
}

export const INVENTORY_SLOT_SIZE = 60;
export const INVENTORY_SLOT_PADDING = 15;

const inventoryGrid = new Grid(
    INVENTORY_SLOT_PADDING,
    INVENTORY_SLOT_PADDING,
    INVENTORY_SLOT_SIZE,
    INVENTORY_SLOT_SIZE,
    1
);

/**
 * The display side of the inventory, holds all of the buttons.
 */
class InventoryDisplay {
    container: PIXI.Container;
    buttons: InventoryButton[];
    slotamount: number;
    inventory: Inventory;
    rightclick?: (item: number) => void;
    leftclick?: (item: number) => void;

    constructor(inventory: Inventory) {
        this.inventory = inventory;
        this.container = new PIXI.Container();
        this.buttons = [];
        this.slotamount = 0;
    }

    /**
     * Change the slot count of the display
     * @param count Number of slots to display
     */
    slotCount(count: number) {
        this.container.removeChildren();
        this.buttons = [];
        this.slotamount = count;
        for (let i = 0; i < count; i++) {
            const button = new InventoryButton();
            button.leftclick = this.leftclick;
            button.rightclick = this.rightclick;
            this.buttons.push(button);
            this.container.addChild(button.button);
            button.button.onpointerdown = () => {
                button.down = true;
                dragStart(button, this.inventory);
            };
            button.down = false;
        }
        inventoryGrid.arrange(this.buttons);
    }

    setCallbacks(leftclick?: Callback, rightclick?: Callback) {
        this.leftclick = leftclick;
        this.rightclick = rightclick;
        for (const button of this.buttons) {
            button.leftclick = leftclick;
            button.rightclick = rightclick;
        }
    }

    /**
     * Update's the inventory display.
     * @param items List of items to put in the display
     */
    update(items: Item[]) {
        for (let i = 0; i < items.length; i++) {
            if (items[i]) {
                try {
                    const amount = items[i][1];
                    this.buttons[i].amount.text = prettifyNumber(amount);
                    this.buttons[i].item = items[i][0];
                } catch {}
            }
        }
        this.resize();
    }

    resize() {
        this.container.position.set(
            percentOf(50, window.innerWidth) -
                percentOf(
                    50,
                    (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_PADDING) *
                        this.slotamount
                ),

            window.innerHeight - INVENTORY_SLOT_SIZE
        );
    }
}

/**
 * You started dragging a button, good job!
 * @param button The button that is being draged
 */
function dragStart(button: InventoryButton, inventory: Inventory) {
    if (button.item === null) {
        return;
    }
    const sprite = SpriteFactory.build(button.item ?? -1);
    sprite.scale.set(0.12);
    sprite.anchor.set(0.5);
    sprite.alpha = 0.8;
    const _dragMove = (event: PointerEvent) =>
        dragMove(sprite, event, inventory);

    function dragEnd() {
        window.removeEventListener("pointermove", _dragMove);
        window.removeEventListener("pointerup", dragEnd);
        inventory.display.container.removeChild(sprite);
        findswap(button, inventory);
    }

    window.addEventListener("pointermove", _dragMove);
    window.addEventListener("pointerup", dragEnd);
}

/**
 * Triggers when moving your mouse
 * @param sprite The dragged item sprite
 * @param event The mouseMove event
 */
function dragMove(
    sprite: PIXI.Sprite,
    event: PointerEvent,
    inventory: Inventory
) {
    let isActive: boolean = false;
    if (isActive === false) {
        inventory.display.container.addChild(sprite);
    }
    const pos = sprite.parent.toLocal(
        new PIXI.Point(event.clientX, event.clientY),
        undefined,
        sprite.position
    );
    sprite.position.set(pos.x, pos.y);
}

/**
 * Find which button to swap with.
 * @param button Orginal button that is going to be swapped with another
 */
function findswap(button: InventoryButton, inventory: Inventory) {
    for (let item of inventory.display.buttons) {
        if (item.hovering) {
            const currentButton = inventory.display.buttons.indexOf(item);
            const oldButton = inventory.display.buttons.indexOf(button);

            const oldItem = inventory.slots[oldButton];

            inventory.slots.splice(oldButton, 1);
            inventory.slots.splice(currentButton, 0, oldItem);

            for (let i = inventory.slots.length - 1; i >= 0; i--) {
                const currentItem = inventory.slots[i];

                if (!currentItem) {
                    inventory.slots.push(inventory.slots.splice(i, 1)[0]);
                }
            }

            inventory.update([inventory.display.slotamount, inventory.slots]);
        }
    }
}
