import * as PIXI from "pixi.js";
import { InventoryButton } from "./button";

type Item = { imagePath: string; result: string; amount: number };

export class Inventory {
    container: PIXI.Container;
    slots: InventoryButton[];

    constructor() {
        this.container = new PIXI.Container();
        this.slots = [];
    }

    addSlot(item?: Item) {
        const button = new InventoryButton();
        if (item) {
            button.setItem(item);
        }
        button.view.x = this.slots.length * (inventorySlotSize + padding);
        this.slots.push(button);
        this.container.addChild(button.view);
        button.view.on("pointerdown", () => dragStart(button));
    }

    rerender() {
        for (let button of this.slots) {
            this.container.removeChild(button.view);
            console.log(button, this.slots);
            this.container.addChild(button.view);
            button.view.x = this.slots.length * (inventorySlotSize + padding);
        }
    }
    remove() {
        for (let button of this.slots) {
            this.slots = [];
            this.container.removeChild(button.view);
        }
    }
}

const inventorySlotSize = 60;
const inventorySlotCount = 10;
const padding = 6;

export const inventory = new Inventory();
export const localInventoryOrder: Item[] = [];

function resize() {
    inventory.container.position.set(
        (window.innerWidth - inventorySlotSize * inventorySlotCount) / 2,
        window.innerHeight - inventorySlotSize - 10
    );
}
window.addEventListener("resize", resize);
resize();

const invItems: Item[] = [
    {
        imagePath: "./assets/gold_wall.svg",
        result: "Selected Item 1",
        amount: 2,
    },
    {
        imagePath: "./assets/meat.svg",
        result: "Selected Item 2",
        amount: 3,
    },
    {
        imagePath: "./assets/gold_hammer.svg",
        result: "Selected Item 3",
        amount: 4,
    },
    {
        imagePath: "./assets/stone.svg",
        result: "Selected Item 4",
        amount: 9,
    },
];

function holdinventory(newItems: Item[] = []) {
    for (const newItem of newItems) {
        const existingIndex = localInventoryOrder.findIndex(
            (item) => item.result === newItem.result
        );

        if (existingIndex !== -1) {
            localInventoryOrder[existingIndex] = {
                ...localInventoryOrder[existingIndex],
                ...newItem,
            };
        } else {
            localInventoryOrder.push(newItem);
        }

        updateinventory();
    }
}

holdinventory(invItems);

function updateinventory() {
    inventory.remove();
    for (let i = 0; i < inventorySlotCount; i++) {
        const item = localInventoryOrder[i];

        inventory.addSlot(item);
    }
}

function dragStart(button: InventoryButton) {
    const sprite = PIXI.Sprite.from(button.item.imagePath);
    sprite.scale.set(0.12);
    sprite.anchor.set(0.5);
    sprite.alpha = 0.8;
    const _dragMove = (event: PointerEvent) => dragMove(sprite, event);

    function dragEnd() {
        window.removeEventListener("pointermove", _dragMove);
        window.removeEventListener("pointerup", dragEnd);
        inventory.container.removeChild(sprite);
        findswap(button);
    }

    window.addEventListener("pointermove", _dragMove);
    window.addEventListener("pointerup", dragEnd);
}

function dragMove(sprite: PIXI.Sprite, event: PointerEvent) {
    let isActive: boolean = false;
    if (isActive === false) {
        inventory.container.addChild(sprite);
    }
    const pos = sprite.parent.toLocal(
        new PIXI.Point(event.clientX, event.clientY),
        undefined,
        sprite.position
    );
    sprite.position.set(pos.x, pos.y);
}

function findswap(button: InventoryButton) {
    for (let item of inventory.slots) {
        if (item.hovering) {
            const currentButton = inventory.slots.indexOf(item);
            const oldButton = inventory.slots.indexOf(button);

            const oldItem = localInventoryOrder[oldButton];

            localInventoryOrder.splice(oldButton, 1);
            localInventoryOrder.splice(currentButton, 0, oldItem);

            for (let i = localInventoryOrder.length - 1; i >= 0; i--) {
                const currentItem = localInventoryOrder[i];

                if (!currentItem) {
                    localInventoryOrder.push(
                        localInventoryOrder.splice(i, 1)[0]
                    );
                }
            }

            updateinventory();
            console.log(inventory.slots);
        }
    }
}
