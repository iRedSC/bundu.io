import { Button } from "@pixi/ui";
import * as PIXI from "pixi.js";
import { Layout } from "@pixi/layout";


type Item = { imagePath: string; result: string; category: string };


const createCraftingButton = (item: Item) => {
    const buttonContainer = new PIXI.Container();


    const background = new PIXI.Graphics();


    let fillColor = 0x777777;
    let borderColor = 0x444444;


    background.lineStyle(2, borderColor, 1);
    background.beginFill(fillColor, 0.7); 
    background.drawRoundedRect(0, 0, 60, 60, 10);
    background.endFill();

    buttonContainer.addChild(background);

    const itemImage = PIXI.Sprite.from(item.imagePath, {
        mipmap: PIXI.MIPMAP_MODES.ON,
    });

    itemImage.width = 45;
    itemImage.height = 45;
    itemImage.anchor.set(0.5);
    itemImage.position.set(background.width / 2, background.height / 2);

    buttonContainer.addChild(itemImage);

    const button = new Button(buttonContainer);

    button.view.width = background.width;
    button.view.height = background.height;
    button.view.pivot.set(button.view.width / 2, button.view.height / 2);

    button.down = () => {
        button.view.scale.set(0.9);
        fillColor = 0x77777;
        borderColor = 0x333333;

        updateButtonAppearance();
    };

    button.up = () => {
        button.view.scale.set(1);
        fillColor = 0x777777;
        borderColor = 0x444444;

        updateButtonAppearance();
    };

    button.view.interactive = true;

    button.view.on("mouseover", () => {
        button.view.scale.set(1.1);
        fillColor = 0x999999;
        borderColor = 0x666666;

        updateButtonAppearance();
    });

    button.view.on("mouseout", () => {
        button.view.scale.set(1);
        fillColor = 0x777777;
        borderColor = 0x444444;

        updateButtonAppearance();
    });

    button.view.on("pointertap", () => {
        console.log(item.result);
    });

    const updateButtonAppearance = () => {
        background.clear();
        background.lineStyle(2, borderColor, 1);
        background.beginFill(fillColor, 0.7);
        background.drawRoundedRect(0, 0, 60, 60, 10);
        background.endFill();
    };

    return button;
};


const craftingItems: Item[] = [
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

const buttonsPerRow = 4;
const craftingButtonContainer = new PIXI.Container();
const paddingLeft = 40;
const paddingTop = 40;
const buttonSize = 68;
let currentRow = 0;
let currentCol = 0;

craftingItems.forEach((item) => {
    const button = createCraftingButton(item);
    button.view.position.set(
        paddingLeft + currentCol * buttonSize,
        paddingTop + currentRow * buttonSize
    );
    craftingButtonContainer.addChild(button.view);

    currentRow++;

    if (currentRow >= buttonsPerRow) {
        currentRow = 0;
        currentCol++;
    }
});

const filterButtonContainer = new PIXI.Container();
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
    craftingButtonContainer.x + craftingButtonContainer.height + 40,
    

);


export const UI = new Layout({
    id: "root",
    content: {
        container1: filterButtonContainer,
        container2: craftingButtonContainer,
    },
    styles: {
        background: "red",
    },
});


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
        const button = createCraftingButton(item);
        button.view.position.set(
            paddingLeft + currentCol * buttonSize,
            paddingTop + currentRow * buttonSize
        );
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
    


    const colorMatrixFilter = new PIXI.filters.ColorMatrixFilter();
    button.view.filters = [colorMatrixFilter];

    button.view.on("pointertap", () => {
        toggleCategory(category);
        updateButtonAppearance(activeCategories.has(category));
    });

    function updateButtonAppearance(selected: boolean) {
        const scale = selected ? .11 : .1; 
        button.view.scale.set(scale);
        sprite.tint = selected ? 0xfffff : 0xffffff;
    }
    
    return button;
}
