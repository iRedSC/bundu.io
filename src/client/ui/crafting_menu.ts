import { Button } from "@pixi/ui";
import * as PIXI from "pixi.js";
import { ItemButton } from "./button";
import { assets } from "../assets/load";
export const craftingItems: Item[] = [
    {
        imagePath: "./assets/gold_wall.svg",
        result: "Crafted Item 1",
        category: "structures",
    },
    {
        imagePath: "./assets/meat.svg",
        result: "Crafted Item 2",
        category: "misc",
    },
    {
        imagePath: "./assets/gold_hammer.svg",
        result: "Crafted Item 3",
        category: "tools",
    },
    {
        imagePath: "./assets/stone.svg",
        result: "Crafted Item 4",
        category: "misc",
    },
    {
        imagePath: "./assets/diamond_wall.svg",
        result: "Crafted Item 5",
        category: "structures",
    },
    {
        imagePath: "./assets/diamond.svg",
        result: "Crafted Item 6",
        category: "misc",
    },
    {
        imagePath: "./assets/stone_sword.svg",
        result: "Crafted Item 7",
        category: "tools",
    },
    {
        imagePath: "./assets/amethyst.svg",
        result: "Crafted Item 8",
        category: "misc",
    },
    {
        imagePath: "./assets/wood.svg",
        result: "Crafted Item 9",
        category: "misc",
    },
    {
        imagePath: "./assets/ram_wool.svg",
        result: "Crafted Item 10",
        category: "misc",
    },
    {
        imagePath: "./assets/wood_wall.svg",
        result: "Crafted Item 11",
        category: "structures",
    },
    {
        imagePath: "./assets/earmuffs.svg",
        result: "Crafted Item 12",
        category: "tools",
    },
    {
        imagePath: "./assets/gold_spear.svg",
        result: "Crafted Item 13",
        category: "tools",
    },
    {
        imagePath: "./assets/gold_pickaxe.svg",
        result: "Crafted Item 13",
        category: "tools",
    },
    {
        imagePath: "./assets/gold_sword.svg",
        result: "Crafted Item 13",
        category: "tools",
    },
    {
        imagePath: "./assets/gold_helmet.svg",
        result: "Crafted Item 13",
        category: "tools",
    },
    {
        imagePath: "./assets/diamond_wall.svg",
        result: "Crafted Item 13",
        category: "structures",
    },
    {
        imagePath: "./assets/diamond_spike.svg",
        result: "Crafted Item 13",
        category: "structures",
    },
    {
        imagePath: "./assets/stone_door.svg",
        result: "Crafted Item 13",
        category: "structures",
    },
];
// IN -> RECEIVE ARRAY OF CRAFTABLE ITEMS
// OUT -> CRAFTING BUTTONS SEND REQUEST TOs SERVER

type Item = { imagePath: string; result: string; category: string };

export class CraftingMenu {
    items: Array<Item>;
    container: PIXI.Container;
    padding: number;
    buttonSize: number;
    buttonsPerRow: number;

    constructor(columns: number, padding: number, buttonSize: number) {
        this.items = [];
        this.container = new PIXI.Container();
        this.buttonsPerRow = columns;
        this.padding = padding;
        this.buttonSize = buttonSize;
    }
    update(categories?: Set<string>) {
        if (categories === undefined) {
            categories = new Set();
        }
        let currentCol = 0;
        let currentRow = 0;
        this.container.removeChildren();
        for (let item of this.items) {
            if (categories!.size > 0) {
                if (!categories!.has(item.category)) {
                    continue;
                }
            }
            const button = new ItemButton();
            button.view.position.set(
                this.padding + currentCol * this.buttonSize,
                this.padding + currentRow * this.buttonSize
            );
            button.setItem(item);
            this.container.addChild(button.view);

            currentRow++;

            if (currentRow >= this.buttonsPerRow) {
                currentRow = 0;
                currentCol++;
            }
        }
    }
}

class FilterButton extends Button {
    constructor(
        activeCategories: Set<string>,
        toggleCallback: Function,
        category: string,
        xOffset: number,
        texture: PIXI.Texture,
        size: number
    ) {
        const sprite: PIXI.Sprite = new PIXI.Sprite(texture);
        super(sprite);
        sprite.anchor.set(0.5, 0.5);
        this.view.width = size;
        this.view.height = size;
        this.view.position.set(xOffset, 0);
        this.view.pivot.set(this.view.width / 2, this.view.height / 2);

        const colorMatrixFilter = new PIXI.ColorMatrixFilter();
        this.view.filters = [colorMatrixFilter];

        this.view.on("pointertap", () => {
            toggleCallback(category);
            this.updateButtonAppearance(activeCategories.has(category));
        });
    }

    updateButtonAppearance(selected: boolean) {
        const scale = selected ? 0.11 : 0.1;
        const sprite = this.view as PIXI.Sprite;
        this.view.scale.set(scale);
        sprite.tint = selected ? 0xfffff : 0xffffff;
    }
}
export class Filter {
    container: PIXI.Container;
    activeCategories: Set<string>;
    buttonSize: number;
    nextPos: number;
    craftingMenu: CraftingMenu;

    constructor(buttonSize: number, craftingMenu: CraftingMenu) {
        this.craftingMenu = craftingMenu;
        this.activeCategories = new Set();
        this.container = new PIXI.Container();
        this.buttonSize = buttonSize;
        this.nextPos = 0;
    }

    add(category: string, texture: PIXI.Texture) {
        const button = new FilterButton(
            this.activeCategories,
            this.filter.bind(this),
            category,
            this.nextPos,
            texture,
            this.buttonSize
        );
        this.nextPos += this.buttonSize + 10;
        this.container.addChild(button.view);
    }

    filter(category: string) {
        if (this.activeCategories.has(category)) {
            this.activeCategories.delete(category);
        } else {
            this.activeCategories.add(category);
        }
        this.craftingMenu.update(this.activeCategories);
    }
}

export const craftingMenu = new CraftingMenu(3, 24, 68);
export const filterButtons = new Filter(40, craftingMenu);
filterButtons.add("tools", assets("weapon_toggle"));
filterButtons.add("structures", assets("build_toggle"));
filterButtons.add("misc", assets("misc_toggle"));

filterButtons.container.position.set(
    35,
    craftingMenu.container.x + craftingMenu.container.height + 230
);

craftingMenu.items = craftingItems;

craftingMenu.update();
