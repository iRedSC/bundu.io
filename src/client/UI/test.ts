import { Button } from '@pixi/ui';
import * as PIXI from 'pixi.js';
import { Layout } from '@pixi/layout';

// Define the Item type
type Item = { imagePath: string; result: string; category: string };

// Function to create a crafting button
const createCraftingButton = (item: Item) => {
    const buttonContainer = new PIXI.Container();

    // Create a gray background for the button
    const background = new PIXI.Graphics();

    // Initial fill color and border color
    let fillColor = 0x777777;
    let borderColor = 0x444444;

    // Draw the rounded rectangle with the initial fill color
    background.lineStyle(2, borderColor, 1);
    background.beginFill(fillColor, 0.7); // Initial transparency
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

    button.view.on('mouseover', () => {
        button.view.scale.set(1.1);
        fillColor = 0x999999;
        borderColor = 0x666666;

        updateButtonAppearance();
    });

    button.view.on('mouseout', () => {
        button.view.scale.set(1);
        fillColor = 0x777777;
        borderColor = 0x444444;

        updateButtonAppearance();
    });

    button.view.on('pointertap', () => {
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

// List of crafting items with properties (imagePath, result, category)
const craftingItems: Item[] = [
    { imagePath: './assets/gold_wall.svg', result: 'Crafted Item 1', category: 'Metal' },
    { imagePath: './assets/meat.svg', result: 'Crafted Item 2', category: 'Food' },
    { imagePath: './assets/name.svg', result: 'Crafted Item 3', category: 'Miscellaneous' },
    { imagePath: './assets/stone.svg', result: 'Crafted Item 4', category: 'Miscellaneous' },
    { imagePath: './assets/diamond_wall.svg', result: 'Crafted Item 5', category: 'Metal' },
    { imagePath: './assets/diamond.svg', result: 'Crafted Item 6', category: 'Metal' },
    { imagePath: './assets/gold_sword.svg', result: 'Crafted Item 7', category: 'Metal' },
    { imagePath: './assets/amethyst.svg', result: 'Crafted Item 8', category: 'Miscellaneous' },
    { imagePath: './assets/wood.svg', result: 'Crafted Item 9', category: 'Wood' },
    { imagePath: './assets/wood.svg', result: 'Crafted Item 10', category: 'Wood' },
    { imagePath: './assets/wood.svg', result: 'Crafted Item 11', category: 'Wood' },
    { imagePath: './assets/earmuffs.svg', result: 'Crafted Item 12', category: 'Miscellaneous' },
    { imagePath: './assets/gold_spear.svg', result: 'Crafted Item 13', category: 'Metal' },
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
const filterButtonSize = 30; // Adjust the size as needed

// Add this line at the beginning of your file
const activeCategories: Set<string> = new Set();

// Create filter buttons
const metalFilterButton = createToggleButton('Metal', 0, './assets/weapon_toggle.svg');
const foodFilterButton = createToggleButton('Food', filterButtonSize + 10, './assets/build_toggle.svg');
const miscFilterButton = createToggleButton('Miscellaneous', 2 * (filterButtonSize + 10), './assets/misc_toggle.svg');

// Add filter buttons to the container
filterButtonContainer.addChild(metalFilterButton.view);
filterButtonContainer.addChild(foodFilterButton.view);
filterButtonContainer.addChild(miscFilterButton.view);

// Position the filter button container
filterButtonContainer.position.set(
    craftingButtonContainer.x + craftingButtonContainer.width + 20,
    10
);

// Add the filter button container and crafting button container to the UI layout
export const UI = new Layout({
    id: 'root',
    content: {
        container1: filterButtonContainer,
        container2: craftingButtonContainer,
    },
    styles: {
        background: 'red',
    },
});

// Rest of the code remains the same
// Toggle category function
const toggleCategory = (category: string) => {
    if (activeCategories.has(category)) {
        activeCategories.delete(category);
    } else {
        activeCategories.add(category);
    }

    filterButtons();
};

// Filter buttons function
const filterButtons = () => {
    craftingButtonContainer.removeChildren(); // Clear existing buttons

    const filteredItems = craftingItems.filter((item) => {
        if (activeCategories.size === 0 || activeCategories.has('All')) {
            return true; // No categories selected or 'All' selected, show all items
        }
        return activeCategories.has(item.category);
    });

    // Reposition and add crafting buttons to the container
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

// Helper function to create a toggle button with updated appearance
function createToggleButton(category: string, yOffset: number, assetPath: string) {
    const button = new Button(PIXI.Sprite.from(assetPath, { mipmap: PIXI.MIPMAP_MODES.ON }));
    button.view.width = filterButtonSize;
    button.view.height = filterButtonSize;
    button.view.position.set(0, yOffset);

    const colorMatrixFilter = new PIXI.filters.ColorMatrixFilter();
    button.view.filters = [colorMatrixFilter];

    button.view.on('pointertap', () => {
        toggleCategory(category);
        updateButtonAppearance(activeCategories.has(category));
    });

    function updateButtonAppearance(selected: boolean) {
        const hue = selected ? 0xFF0000 : 0xFFFFFF; // Adjust the tint color (red when selected, white when not)
        button.view.tint = hue;
    }

    return button;
}
