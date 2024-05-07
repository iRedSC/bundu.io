import * as PIXI from "pixi.js";
import { ItemButton } from "./item_button";
import {
    colorLerp,
    lerp,
    prettifyNumber,
    radians,
    rotationLerp,
} from "../../lib/transforms";
import { TEXT_STYLE } from "../assets/text";
import { SpriteFactory } from "../assets/sprite_factory";
import { SCHEMA } from "../../shared/enums";
import { Grid } from "./grid";
import { percentOf } from "../../lib/math";
import { Animation } from "../../lib/animations";
import { UIAnimationManager } from "./animation_manager";

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

        UIAnimationManager.set(this, 0, buttonAnimation(this).run(), true);
        this.amount = new PIXI.Text("", TEXT_STYLE);
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
}

function buttonAnimation(button: ItemButton) {
    const animation = new Animation();
    let y: number;

    animation.keyframes[0] = (animation) => {
        if (animation.firstFrameTrigger) {
            y = button.button.position.y;
        }
        if (button.rightDown) {
            button.button.scale.set(lerp(button.button.scale.x, 0.8, 0.2));
            button.background.tint = colorLerp(
                Number(button.background.tint),
                0x333333,
                0.2
            );
            button.background.position.y = lerp(
                button.background.position.y,
                y - 10,
                0.2
            );
            button.itemSprite.position.y = lerp(
                button.itemSprite.position.y,
                y - 10,
                0.2
            );
            button.background.rotation = lerp(
                button.background.rotation,
                radians(45),
                0.2
            );
            return;
        }

        button.background.rotation = lerp(
            button.background.rotation,
            radians(0),
            0.2
        );
        button.background.position.y = lerp(
            button.background.position.y,
            y,
            0.2
        );
        button.itemSprite.position.y = lerp(
            button.itemSprite.position.y,
            y,
            0.2
        );

        if (button.down) {
            button.button.scale.set(lerp(button.button.scale.x, 0.8, 0.2));
            button.background.tint = colorLerp(
                Number(button.background.tint),
                0x333333,
                0.2
            );
            return;
        }
        if (button.hovering) {
            button.background.rotation = rotationLerp(
                button.background.rotation,
                Math.sin(Date.now() / 500) * 0.3,
                0.2
            );
            button.button.scale.set(lerp(button.button.scale.x, 1.1, 0.1));
            button.background.tint = colorLerp(
                Number(button.background.tint),
                0x999999,
                0.1
            );
            return;
        }

        button.button.scale.set(lerp(button.button.scale.x, 1, 0.1));
        button.background.tint = colorLerp(
            Number(button.background.tint),
            0x777777,
            0.1
        );
    };

    return animation;
}

/**
 * The inventory, where all of your item data is stored.
 */

type Callback = (item: number) => void;

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
export class Inventory {
    container: PIXI.Container;
    buttons: InventoryButton[];
    itemsArray: Item[];
    items: Map<number, number>;
    rightclick?: (item: number) => void;
    leftclick?: (item: number) => void;

    constructor() {
        this.items = new Map();
        this.itemsArray = [];
        this.container = new PIXI.Container();
        this.buttons = [];
        this.slotCount = 0;
    }

    /**
     * Change the slot count of the display
     * @param count Number of slots to display
     */
    set slotCount(count: number) {
        if (this.buttons.length >= count) {
            const remove = this.buttons.length - count;
            this.buttons.slice(0, -remove);
            return;
        }
        const add = count - this.buttons.length;
        for (let i = 0; i < add; i++) {
            const button = new InventoryButton();
            button.leftclick = this.leftclick;
            button.rightclick = this.rightclick;
            this.buttons.push(button);
            this.container.addChild(button.button);
            button.button.onpointerdown = (ev) => {
                if (ev?.button === 2) {
                    button.rightDown = true;
                } else {
                    dragStart(button, this);
                }
                button.down = true;
            };
            button.down = false;
        }
        inventoryGrid.arrange(this.buttons);
    }

    get slotCount() {
        return this.buttons.length;
    }

    setCallbacks(leftclick?: Callback, rightclick?: Callback) {
        this.leftclick = leftclick;
        this.rightclick = rightclick;
        for (const button of this.buttons) {
            button.leftclick = leftclick;
            button.rightclick = rightclick;
        }
    }

    update(update: SCHEMA.SERVER.UPDATE_INVENTORY) {
        this.slotCount = update[0];

        const incoming = update[1].filter((item) => !!item);
        this.items.clear();
        for (const [id, amount] of incoming) {
            this.items.set(id, amount);
            const existing = this.itemsArray.findIndex(
                (item) => item[0] === id
            );
            if (existing >= 0) {
                this.itemsArray[existing][1] = amount;
                continue;
            }
            this.itemsArray.push([id, amount]);
        }
        this.itemsArray = this.itemsArray.filter((item) =>
            incoming.some((i) => i[0] === item[0])
        );
        for (const [i, button] of this.buttons.entries()) {
            button.clear();
            const item = this.itemsArray[i];
            if (!item) break;
            const amount = item[1];
            button.amount.text = prettifyNumber(amount);
            button.item = item[0];
        }
        this.resize();
    }

    resize() {
        this.container.position.set(
            percentOf(50, window.innerWidth) -
                percentOf(
                    50,
                    (INVENTORY_SLOT_SIZE + INVENTORY_SLOT_PADDING) *
                        (this.slotCount - 1)
                ),

            window.innerHeight - INVENTORY_SLOT_SIZE
        );
    }
}

/**
 * You started dragging a button, good job!
 * @param button The button that is being draged
 */
function dragStart(button: InventoryButton, display: Inventory) {
    if (button.item === null) {
        return;
    }
    const sprite = SpriteFactory.build(button.item ?? -1);
    sprite.scale.set(0.05);
    sprite.anchor.set(0.5);
    sprite.alpha = 0.8;
    const _dragMove = (event: PointerEvent) => dragMove(sprite, event, display);

    function dragEnd() {
        window.removeEventListener("pointermove", _dragMove);
        window.removeEventListener("pointerup", dragEnd);
        display.container.removeChild(sprite);
        findswap(button, display);
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
    display: Inventory
) {
    let isActive: boolean = false;
    if (isActive === false) {
        display.container.addChild(sprite);
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
function findswap(button: InventoryButton, display: Inventory) {
    for (let item of display.buttons) {
        if (item.hovering) {
            const currentButton = display.buttons.indexOf(item);
            const oldButton = display.buttons.indexOf(button);

            const oldItem = display.itemsArray[oldButton];

            display.itemsArray.splice(oldButton, 1);
            display.itemsArray.splice(currentButton, 0, oldItem);

            for (let i = display.itemsArray.length - 1; i >= 0; i--) {
                const currentItem = display.itemsArray[i];

                if (!currentItem) {
                    display.itemsArray.push(display.itemsArray.splice(i, 1)[0]);
                }
            }

            display.update([display.slotCount, display.itemsArray]);
        }
    }
}
