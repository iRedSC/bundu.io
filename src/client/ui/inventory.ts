import * as PIXI from "pixi.js";
import { ItemButton } from "./button";
import { colorLerp } from "../../lib/transforms";
import { TEXT_STYLE } from "../assets/text";

type Item = { imagePath: string; result: string; amount: number };

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

export class Inventory {
    slots: Item[];
    display: InventoryDisplay;

    constructor() {
        this.slots = [];
        this.display = new InventoryDisplay();
    }
}

class InventoryDisplay {
    container: PIXI.Container;
    buttons: InventoryButton[];
    slotamount: number;
    constructor() {
        this.container = new PIXI.Container();
        this.buttons = [];
        this.slotamount = 0;
    }

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

    update(items: Item[]) {
        for (let i = 0; i < items.length; i++) {
            if (items[i]) {
                try {
                    this.buttons[i].amount.text = `${items[i].amount}`;
                    this.buttons[i].setItem(items[i]);
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
    {
        imagePath: "./assets/gold_wall.svg",
        result: "Selected Item 1",
        amount: 245,
    },
    {
        imagePath: "./assets/meat.svg",
        result: "Selected Item 2",
        amount: 9982,
    },
    {
        imagePath: "./assets/gold_hammer.svg",
        result: "Selected Item 3",
        amount: 4,
    },
    {
        imagePath: "./assets/stone.svg",
        result: "Selected Item 4",
        amount: 5,
    },
    {
        imagePath: "./assets/gold_helmet.svg",
        result: "Selected Item 4",
        amount: 6,
    },
    {
        imagePath: "./assets/gold_sword.svg",
        result: "Selected Item 4",
        amount: 77,
    },
    {
        imagePath: "./assets/diamond_pickaxe.svg",
        result: "Selected Item 4",
        amount: 8,
    },
    {
        imagePath: "./assets/earmuffs.svg",
        result: "Selected Item 4",
        amount: 9,
    },
];

inventory.slots = structuredClone(invItems);

inventory.display.slotCount(inventorySlotCount);
function updateinventory() {
    inventory.display.update(inventory.slots);
    resize();
}
updateinventory();

function dragStart(button: InventoryButton) {
    const sprite = PIXI.Sprite.from(button.item.imagePath);
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
