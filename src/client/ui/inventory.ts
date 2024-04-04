import * as PIXI from "pixi.js";
import { ItemButton } from "./button";
import { colorLerp } from "../../lib/transforms";
import { TEXT_STYLE } from "../assets/text";
import { SpriteFactory } from "../assets/sprite_factory";

/**
 * Ah yes the inventory, not looking so good rn
 * I'm going to try to get is nice and cleaned up soon enough.
 */

type Item = { name: string; amount: number };

/**
 * The InventoryButton is what makes up the hotbar.
 * It can be clicked to select the item in it's slot,
 * or you can drag the item to a new slot to rearrange.
 */
export class InventoryButton extends ItemButton {
    selected: boolean;
    amount: PIXI.Text;
    constructor() {
        super();
        this.amount = new PIXI.Text("", TEXT_STYLE);
        this.amount.position.set(55, 50);
        this.amount.scale.set(0.6);
        this.amount.anchor.set(1, 0.5);
        this.amount.zIndex = 2;
        this.selected = false;
        this.view.addChild(this.amount);
        this.view.sortChildren();
    }

    /**
     * Update the button with a specific style.
     * @param fillColor Button's fill color
     * @param borderColor Buttons' border color
     */
    override update(fillColor: number, borderColor: number) {
        let newFill = fillColor;
        let newBorder = borderColor;
        if (this.selected) {
            newFill = colorLerp(fillColor, 0xffffff, 0.5);
            newBorder = colorLerp(borderColor, 0xffffff, 0.5);
        }
        super.update(newFill, newBorder);
    }

    override down() {
        this.view.scale.set(1.1);
        this.update(0x777777, 0x444444);
    }

    override up() {
        this.view.scale.set(1);

        if (this.hovering) {
            this.hover();
        } else {
            this.update(0x777777, 0x444444);
        }
    }
}

/**
 * The inventory, where all of your item data is stored.
 */
export class Inventory {
    slots: Item[];
    display: InventoryDisplay;

    constructor() {
        this.slots = [];
        this.display = new InventoryDisplay();
    }
}

/**
 * The display side of the inventory, holds all of the buttons.
 */
class InventoryDisplay {
    container: PIXI.Container;
    buttons: InventoryButton[];
    slotamount: number;
    constructor() {
        this.container = new PIXI.Container();
        this.buttons = [];
        this.slotamount = 0;
    }

    /**
     * Change the slot count of the display
     * @param count Number of slots to display
     */
    slotCount(count: number) {
        for (let i = 0; i < count; i++) {
            const button = new InventoryButton();
            button.view.x = this.buttons.length * (inventorySlotSize + padding);
            this.slotamount = count;
            this.buttons.push(button);
            this.container.addChild(button.view);
            button.view.on("pointerdown", () => dragStart(button));
            button.press = () => {
                for (let _button of this.buttons) {
                    _button.selected = false;
                    _button.up();
                }
                button.selected = true;
            };
        }
    }

    /**
     * Update's the inventory display!
     * @param items List of items to put in the display
     */
    update(items: Item[]) {
        for (let i = 0; i < items.length; i++) {
            if (items[i]) {
                try {
                    this.buttons[i].amount.text = `${items[i].amount}`;
                    this.buttons[i].setItem(items[i].name);
                } catch {}
            }
        }
    }
}

const inventorySlotSize = 60;
const inventorySlotCount = 10;
const padding = 6;

export const inventory = new Inventory();

function resize() {
    inventory.display.container.position.set(
        (window.innerWidth - inventorySlotSize * inventory.display.slotamount) /
            2,
        window.innerHeight - inventorySlotSize - 10
    );
}
window.addEventListener("resize", resize);
resize();

const invItems: Item[] = [
    { name: "stone", amount: 50 },
    { name: "gold_pickaxe", amount: 1 },
    { name: "diamond_helmet", amount: 1 },
];

inventory.slots = structuredClone(invItems);

inventory.display.slotCount(inventorySlotCount);
function updateinventory() {
    inventory.display.update(inventory.slots);
    resize();
}
updateinventory();

/**
 * You started dragging a button, good job!
 * @param button The button that is being draged
 */
function dragStart(button: InventoryButton) {
    const sprite = SpriteFactory.build(button.item);
    sprite.scale.set(0.12);
    sprite.anchor.set(0.5);
    sprite.alpha = 0.8;
    const _dragMove = (event: PointerEvent) => dragMove(sprite, event);

    function dragEnd() {
        window.removeEventListener("pointermove", _dragMove);
        window.removeEventListener("pointerup", dragEnd);
        inventory.display.container.removeChild(sprite);
        findswap(button);
    }

    window.addEventListener("pointermove", _dragMove);
    window.addEventListener("pointerup", dragEnd);
}

/**
 * Triggers when moving your mouse
 * @param sprite The dragged item sprite
 * @param event The mouseMove event
 */
function dragMove(sprite: PIXI.Sprite, event: PointerEvent) {
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
function findswap(button: InventoryButton) {
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

            updateinventory();
        }
    }
}
