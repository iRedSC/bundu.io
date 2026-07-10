import { Container, Text } from "pixi.js";
import { ItemButton } from "./item_button";
import {
    colorLerp,
    lerp,
    prettifyNumber,
    radians,
    rotationLerp,
    percentOf,
    Animation,
    type AnimationManager,
} from "@bundu/shared";
import { TEXT_STYLE } from "@client/assets/text";
import { Grid } from "./grid";
import { ITEM_BUTTON_SIZE } from "../constants";
import type { ServerPacket } from "@bundu/shared/packet_definitions";

/**
 * Ah yes the inventory, not looking so good rn
 * I'm going to try to get is nice and cleaned up soon enough.
 */

type ItemStack = [id: number, amount: number];

/**
 * The InventoryButton is what makes up the hotbar.
 * It can be clicked to select the item in it's slot,
 * or you can drag the item to a new slot to rearrange.
 */
export class InventoryButton extends ItemButton {
    amount: Text;
    constructor(uiAnimations: AnimationManager) {
        super();

        uiAnimations.set(
            this,
            0,
            inventoryButtonAnimation(this).run(),
            true
        );
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
}

const INVENTORY_COLORS = {
    EMPTY: 0x222910,
    DEFAULT: 0x4a5235,
    HOVER: 0x818f5d,
    DOWN: 0x222910,
    RIGHT_DOWN: 0xb54731,
};

function inventoryButtonAnimation(button: ItemButton) {
    const animation = new Animation();
    let y: number;

    animation.keyframes[0] = (animation) => {
        if (animation.firstFrameTrigger) {
            y = button.button.position.y;
        }
        if (button.rightDown && button.item) {
            button.button.scale.set(lerp(button.button.scale.x, 0.8, 0.2));
            button.background.tint = colorLerp(
                Number(button.background.tint),
                INVENTORY_COLORS.RIGHT_DOWN,
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

        if (button.down && button.item) {
            button.button.scale.set(lerp(button.button.scale.x, 0.8, 0.2));
            button.background.tint = colorLerp(
                Number(button.background.tint),
                INVENTORY_COLORS.DOWN,
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
            if (button.item)
                button.background.tint = colorLerp(
                    Number(button.background.tint),
                    INVENTORY_COLORS.HOVER,
                    0.1
                );

            return;
        }

        button.button.scale.set(lerp(button.button.scale.x, 1, 0.1));
        if (button.item) {
            button.background.tint = colorLerp(
                Number(button.background.tint),
                INVENTORY_COLORS.DEFAULT,
                0.1
            );
            return;
        }
        button.background.tint = colorLerp(
            Number(button.background.tint),
            INVENTORY_COLORS.EMPTY,
            0.1
        );
    };

    return animation;
}

/**
 * The inventory, where all of your item data is stored.
 */

type Callback = (item: number, shift: boolean) => void;

/**
 * The display side of the inventory, holds all of the buttons.
 */
export class Inventory {
    container = new Container();
    buttons: InventoryButton[] = [];
    slots: (ItemStack | null)[] = [];
    items = new Map<number, number>();
    private readonly grid: Grid;
    private readonly uiAnimations: AnimationManager;
    private rightClickCB?: Callback;
    private leftClickCB?: Callback;

    constructor(uiAnimations: AnimationManager) {
        this.uiAnimations = uiAnimations;
        this.grid = new Grid(
            percentOf(10, ITEM_BUTTON_SIZE),
            percentOf(10, ITEM_BUTTON_SIZE),
            ITEM_BUTTON_SIZE,
            ITEM_BUTTON_SIZE,
            1
        );
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
                const button = new InventoryButton(this.uiAnimations);
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

        this.grid.arrange(this.buttons);
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
