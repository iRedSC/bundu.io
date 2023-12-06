import { Button } from '@pixi/ui';
import * as PIXI from 'pixi.js';
import { Layout } from '@pixi/layout';



// Function to create a crafting button
const createCraftingButton = (item: Item) => {
    const buttonContainer = new PIXI.Container();

    // Create a gray background for the button
    const background = new PIXI.Graphics()
        .beginFill(0x888888, 0.7) // Adjust the transparency as needed
        .drawRoundedRect(0, 0, 60, 60, 10); // Adjust the size and corner radius as needed

    buttonContainer.addChild(background);

    // Create a sprite for the item image
    const itemImage = PIXI.Sprite.from(item.imagePath, {
        mipmap: PIXI.MIPMAP_MODES.ON,
    });

    // Set the size of the item image
    itemImage.width = 45; // Adjust the size as needed
    itemImage.height = 45; // Adjust the size as needed

    // Center the item image within the button
    itemImage.position.set(
        (background.width - itemImage.width) / 2,
        (background.height - itemImage.height) / 2
    );

    buttonContainer.addChild(itemImage);

    const button = new Button(buttonContainer);

    // Set the width and height of the button
    button.view.width = background.width;
    button.view.height = background.height;
    button.down = () => button.view.scale.set(.9);
    button.up = () => button.view.scale.set(1);

    button.view.interactive = true; // Make the button interactive

    // Scale up on mouseover
    button.view.on('mouseover', () => {
        button.view.scale.set(1.1);
    });

    // Revert to original scale on mouseout
    button.view.on('mouseout', () => {
        button.view.scale.set(1);
    });

    // Use pointertap event to handle the click
    button.view.on('pointertap', () => {
        console.log(item.result);
    });

    return button;
};

// ... (remaining code)


// List of crafting items with properties (imagePath, result)
const craftingItems = [
    { imagePath: './assets/gold_wall.svg', result: 'Crafted Item 1' },
    { imagePath: './assets/meat.svg', result: 'Crafted Item 2' },
    { imagePath: './assets/name.svg', result: 'Crafted Item 3' },
    { imagePath: './assets/stone.svg', result: 'Crafted Item 4' },
    { imagePath: './assets/diamond_wall.svg', result: 'Crafted Item 5' },
    { imagePath: './assets/diamond.svg', result: 'Crafted Item 6' },
    // Add more items as needed
];

// Number of buttons per row
const buttonsPerRow = 4;

// Create a container to hold the crafting buttons
const craftingButtonContainer = new PIXI.Container();
const paddingLeft = 7;
const paddingTop = 7;
// Position and add crafting buttons to the container
const buttonSize = 65; // Adjust the size as needed
let currentRow = 0;
let currentCol = 0;
type Item = {imagePath: string, result: string};
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

// Create the UI layout with the crafting button container
export const UI = new Layout({
    id: 'root',
    content: {

        container2: craftingButtonContainer,
    },
    styles: {
        background: 'red',
    },
});
