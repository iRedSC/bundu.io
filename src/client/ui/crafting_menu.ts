import { Button } from "@pixi/ui";
import * as PIXI from "pixi.js";
import { ItemButton } from "./button";

// IN -> RECEIVE ARRAY OF CRAFTABLE ITEMS
// OUT -> CRAFTING BUTTONS SEND REQUEST TOs SERVER

type Item = { imagePath: string; result: string; category: string };

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

const buttonsPerRow = 3;
export const craftingButtonContainer = new PIXI.Container();
const paddingLeft = 24;
const paddingTop = 24;
const buttonSize = 68;
let currentRow = 0;
let currentCol = 0;

craftingItems.forEach((item) => {
    const button = new ItemButton();
    button.view.position.set(
        paddingLeft + currentCol * buttonSize,
        paddingTop + currentRow * buttonSize
    );
    button.setItem(item);
    craftingButtonContainer.addChild(button.view);

    currentRow++;

    if (currentRow >= buttonsPerRow) {
        currentRow = 0;
        currentCol++;
    }
});

export const filterButtonContainer = new PIXI.Container();
const filterButtonSize = 40;

const activeCategories: Set<string> = new Set();

const metalFilterButton = createToggleButton(
    "tools",
    0,
    "./assets/weapon_toggle.svg"
);
const foodFilterButton = createToggleButton(
    "structures",
    filterButtonSize + 10,
    "./assets/build_toggle.svg"
);
const miscFilterButton = createToggleButton(
    "misc",
    2 * (filterButtonSize + 10),
    "./assets/misc_toggle.svg"
);

filterButtonContainer.addChild(metalFilterButton.view);
filterButtonContainer.addChild(foodFilterButton.view);
filterButtonContainer.addChild(miscFilterButton.view);

filterButtonContainer.position.set(
    35,
    craftingButtonContainer.x + craftingButtonContainer.height + 40
);

const toggleCategory = (category: string) => {
    if (activeCategories.has(category)) {
        activeCategories.delete(category);
    } else {
        activeCategories.add(category);
    }

    filterButtons();
};

const filterButtons = () => {
    craftingButtonContainer.removeChildren();

    const filteredItems = craftingItems.filter((item) => {
        if (activeCategories.size === 0 || activeCategories.has("All")) {
            return true;
        }
        return activeCategories.has(item.category);
    });

    let currentRow = 0;
    let currentCol = 0;

    filteredItems.forEach((item: Item) => {
        const button = new ItemButton();
        button.view.position.set(
            paddingLeft + currentCol * buttonSize,
            paddingTop + currentRow * buttonSize
        );
        button.setItem(item);
        craftingButtonContainer.addChild(button.view);

        currentRow++;

        if (currentRow >= buttonsPerRow) {
            currentRow = 0;
            currentCol++;
        }
    });
};

function createToggleButton(
    category: string,
    xOffset: number,
    assetPath: string
) {
    const sprite: PIXI.Sprite = PIXI.Sprite.from(assetPath, {
        mipmap: PIXI.MIPMAP_MODES.ON,
    });
    sprite.anchor.set(0.5, 0.5);
    const button = new Button(sprite);
    button.view.width = filterButtonSize;
    button.view.height = filterButtonSize;
    button.view.position.set(xOffset, 0);
    button.view.pivot.set(button.view.width / 2, button.view.height / 2);

    const colorMatrixFilter = new PIXI.ColorMatrixFilter();
    button.view.filters = [colorMatrixFilter];

    button.view.on("pointertap", () => {
        toggleCategory(category);
        updateButtonAppearance(activeCategories.has(category));
        console.log("hi");
    });

    function updateButtonAppearance(selected: boolean) {
        const scale = selected ? 0.11 : 0.1;
        button.view.scale.set(scale);
        sprite.tint = selected ? 0xfffff : 0xffffff;
    }

    return button;
}
