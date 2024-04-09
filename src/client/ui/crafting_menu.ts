import { Button } from "@pixi/ui";
import * as PIXI from "pixi.js";
import { ItemButton } from "./button";
import { Grid } from "./grid";
import { ServerPacketSchema } from "../../shared/enums";

export class RecipeManager {
    recipes: Map<number, [Map<number, number>, number[]]>;

    constructor() {
        this.recipes = new Map();
    }

    updateRecipes(update: ServerPacketSchema.craftingRecipes) {
        console.log("updating recipes");
        console.log(update);
        this.recipes.clear();
        for (const recipe of update) {
            const item = recipe[0];
            const ingredients = recipe[1];
            const flags = recipe[2];

            const ingredientMap = new Map();
            for (const ingredient of ingredients) {
                ingredientMap.set(ingredient[0], ingredient[1]);
            }

            this.recipes.set(item, [ingredientMap, flags]);
        }
    }

    filter(items: [number, number][], flags: number[]): number[] {
        const craftable: number[] = [];
        const itemsMap = new Map(items);
        nextRecipe: for (const [recipeId, recipe] of this.recipes.entries()) {
            const ingredients = recipe[0];
            const itemFlags = new Set(flags);
            for (const flag of recipe[1]) {
                // if (!itemFlags.has(flag)) {
                //     continue nextRecipe;
                // }
            }

            for (const [id, recipeAmount] of ingredients.entries()) {
                const itemsAmount = itemsMap.get(id);
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
type Callback = (item: number) => void;
export class CraftingMenu {
    buttons: ItemButton[];
    items: Item[];
    container: PIXI.Container;
    rows: number;
    grid: Grid;
    private _callback?: Callback;

    constructor(grid: Grid) {
        this.grid = grid;
        this.buttons = [];
        this.items = [];
        this.container = new PIXI.Container();
        this.rows = 0;
    }
    update() {
        this.container.removeChildren();
        this.buttons = [];
        for (let item of this.items) {
            const button = new ItemButton(this._callback);
            button.setItem(item);
            button.update(0x777777);
            this.container.addChild(button.button.view);
            this.buttons.push(button);
        }
        this.grid.arrange(this.buttons);
    }

    setCallback(value: Callback) {
        this._callback = value;
        for (const button of this.buttons) {
            button.setCallback(value);
        }
    }
    set callback(value: Callback) {
        console.log("SET CALLBACK");
        console.log(value);
        this._callback = value;
        for (const button of this.buttons) {
            button.setCallback(value);
        }
    }

    get callback(): Callback | undefined {
        return this._callback;
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
        // this.craftingMenu.update(this.activeCategories);
    }
}

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
