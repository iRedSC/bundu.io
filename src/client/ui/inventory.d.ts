import { Container, Sprite, Text } from "pixi.js";
import { PACKET, SCHEMA } from "../../shared/enums";

type ItemButtonCallback = (item: number, shift?: boolean) => void;

interface ItemDisplay {
    name: string;
    sprite: Sprite;

    contructor(item: string): void;
}

interface ItemButton {
    container: Container;
    enabled: boolean;

    background: Sprite;
    item: ItemDisplay;

    rightClick?: ItemButtonCallback;
    leftClick?: ItemButtonCallback;
}

interface InventoryButton extends ItemButton {
    amount: Text;
    selected?: boolean;

    onDrag: (inventory: Inventory) => void;
}

interface InventoryDisplay {
    container: Container;

    buttons: InventoryButton[];
    slotCount: number;

    rightClick?: ItemButtonCallback;
    leftClick?: ItemButtonCallback;

    swapItems(item1: Item, item2: Item): void;
}

type Item = { id: number; amount: number };

interface Inventory {
    display: InventoryDisplay;
    items: Item[];
    slotCount: number;

    update(packet: SCHEMA.SERVER.UPDATE_INVENTORY): void;
}
