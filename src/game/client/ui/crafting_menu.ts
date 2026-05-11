import { ItemButton } from "./item_button";
import { Grid } from "./grid";
import { Animation } from "../../../ioengine/lib/animations";
import {
    colorLerp,
    lerp,
    radians,
    rotationLerp,
} from "../../../ioengine/lib/transforms";
import { AnimationManagers } from "../animation/animations";
import { ITEM_BUTTON_SIZE } from "../constants";
import type { ServerPacket } from "@shared/packet_definitions";
import { Container, Sprite, Texture } from "pixi.js";

export class RecipeManager {
    recipes: Map<number, [Map<number, number>, number[]]>;

    constructor() {
        this.recipes = new Map();
    }

    updateRecipes({ recipes }: ServerPacket.RecipeList) {
        this.recipes.clear();
        for (const [item, ingredients, flags] of recipes) {
            const ingredientMap = new Map();
            for (const ingredient of ingredients) {
                ingredientMap.set(ingredient[0], ingredient[1]);
            }

            this.recipes.set(item, [ingredientMap, flags]);
        }
    }

    filter(items: Map<number, number>, flags: number[]): number[] {
        const craftable: number[] = [];
        nextRecipe: for (const [recipeId, recipe] of this.recipes.entries()) {
            const ingredients = recipe[0];
            const itemFlags = new Set(flags);
            // for (const flag of recipe[1]) {
            //     if (!itemFlags.has(flag)) {
            //         continue nextRecipe;
            //     }
            // }

            for (const [id, recipeAmount] of ingredients.entries()) {
                const itemsAmount = items.get(id);
                if (!itemsAmount) {
                    continue nextRecipe;
                }
                if (itemsAmount < recipeAmount) {
                    continue nextRecipe;
                }
            }
            craftable.push(recipeId);
        }
        return craftable;
    }
}

type Item = number;

// const craftingGrid = new Grid(6, 6, 68, 68, 3);
type Callback = (item: number, shift: boolean) => void;
export class CraftingMenu {
    buttons: ItemButton[];
    items: Item[];
    container: Container;
    rows: number;
    grid: Grid;
    private rightClickCB?: Callback;
    private leftClickCB?: Callback;

    constructor(grid: Grid) {
        this.grid = grid;
        this.buttons = [];
        this.items = [];
        this.container = new Container();
        this.rows = 0;
    }

    update() {
        if (this.buttons.length >= this.items.length) {
            const remove = this.buttons.length - this.items.length;
            this.buttons
                .splice(-remove, remove)
                .forEach((button) => this.container.removeChild(button.button));
        } else {
            console.log(this.buttons.length, this.items.length);
            const add = this.items.length - this.buttons.length;
            for (let i = 0; i < add; i++) {
                const button = new ItemButton();
                button.rightclick = this.rightClickCB;
                button.leftclick = this.leftClickCB;
                this.container.addChild(button.button);
                this.buttons.push(button);
            }
        }
        this.grid.arrange(this.buttons);
        this.resize();
        for (const [i, button] of this.buttons.entries()) {
            button.item = this.items[i] ?? null;
            AnimationManagers.UI.set(
                button,
                0,
                craftingButtonAnimation(button).run(),
                true
            );
        }
    }

    set rightclick(value: Callback) {
        this.rightClickCB = value;
        this.buttons.forEach((b) => (b.rightclick = value));
    }

    set leftclick(value: Callback) {
        this.leftClickCB = value;
        this.buttons.forEach((b) => (b.leftclick = value));
    }

    resize() {
        this.container.position.set(
            ITEM_BUTTON_SIZE / 2 + this.grid.spacingH,
            ITEM_BUTTON_SIZE / 2 + this.grid.spacingV
        );
    }
}

// class FilterButton extends Container {
//     sprite: Sprite;
//     constructor(
//         activeCategories: Set<string>,
//         toggleCallback: Function,
//         category: string,
//         xOffset: number,
//         texture: Texture,
//         size: number
//     ) {
//         const sprite: Sprite = new Sprite(texture);
//         sprite.anchor.set(0.5, 0.5);
//         this.width = size;
//         this.height = size;
//         this.position.set(xOffset, 0);
//         this.pivot.set(this.width / 2, this.height / 2);

//         const colorMatrixFilter = new PIXI.ColorMatrixFilter();
//         this.filters = [colorMatrixFilter];

//         this.on("pointertap", () => {
//             toggleCallback(category);
//             this.updateButtonAppearance(activeCategories.has(category));
//         });
//     }

//     updateButtonAppearance(selected: boolean) {
//         const scale = selected ? 0.11 : 0.1;
//         const sprite = this as Sprite;
//         this.scale.set(scale);
//         sprite.tint = selected ? 0xfffff : 0xffffff;
//     }
// }
// export class Filter {
//     container: PIXI.Container;
//     activeCategories: Set<string>;
//     buttonSize: number;
//     nextPos: number;
//     craftingMenu: CraftingMenu;

//     constructor(buttonSize: number, craftingMenu: CraftingMenu) {
//         this.craftingMenu = craftingMenu;
//         this.activeCategories = new Set();
//         this.container = new PIXI.Container();
//         this.buttonSize = buttonSize;
//         this.nextPos = 0;
//     }

//     add(category: string, texture: PIXI.Texture) {
//         const button = new FilterButton(
//             this.activeCategories,
//             this.filter.bind(this),
//             category,
//             this.nextPos,
//             texture,
//             this.buttonSize
//         );
//         this.nextPos += this.buttonSize + 10;
//         this.container.addChild(button.view);
//     }

//     filter(category: string) {
//         if (this.activeCategories.has(category)) {
//             this.activeCategories.delete(category);
//         } else {
//             this.activeCategories.add(category);
//         }
//         // this.craftingMenu.update(this.activeCategories);
//     }
// }

// export const filterButtons = new Filter(40, craftingMenu);
// filterButtons.add("tools", assets("weapon_toggle"));
// filterButtons.add("structures", assets("build_toggle"));
// filterButtons.add("misc", assets("misc_toggle"));

// filterButtons.container.position.set(
//     craftingMenu.padding,
//     craftingMenu.buttonsPerRow *
//         (craftingMenu.buttonSize + craftingMenu.padding) +
//         craftingMenu.padding * 2
// );

function craftingButtonAnimation(button: ItemButton) {
    const animation = new Animation();

    animation.keyframes[0] = () => {
        if (button.rightDown) {
            button.button.scale.set(lerp(button.button.scale.x, 0.8, 0.2));
            button.background.tint = colorLerp(
                Number(button.background.tint),
                0x333333,
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
