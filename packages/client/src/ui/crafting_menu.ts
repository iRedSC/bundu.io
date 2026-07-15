import { ItemButton, tickItemButton } from "./item_button";
import type { Grid } from "./grid";
import { ITEM_BUTTON_SIZE } from "../constants";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { Container } from "pixi.js";
import { colorLerp, lerp } from "@bundu/shared/transforms";

const CRAFTING_COLORS = {
    empty: 0x777777,
    default: 0x777777,
    hover: 0x999999,
    down: 0x333333,
    rightDown: 0x333333,
} as const;

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

    filter(items: Map<number, number>, _flags: number[]): number[] {
        const craftable: number[] = [];
        nextRecipe: for (const [recipeId, recipe] of this.recipes.entries()) {
            const ingredients = recipe[0];

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

type Callback = (item: number, shift: boolean) => void;
export class CraftingMenu {
    buttons: ItemButton[];
    items: Item[];
    container: Container;
    rows: number;
    grid: Grid;
    private rightClickCB?: Callback;
    private leftClickCB?: Callback;
    craftingItemId: number | null = null;

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
            this.buttons.splice(-remove, remove).forEach((button) => {
                this.container.removeChild(button.button);
                button.destroy();
            });
        } else {
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
        }
    }

    set rightclick(value: Callback) {
        this.rightClickCB = value;
        for (const button of this.buttons) button.rightclick = value;
    }

    set leftclick(value: Callback) {
        this.leftClickCB = value;
        for (const button of this.buttons) button.leftclick = value;
    }

    tick(now?: number) {
        for (const button of this.buttons) {
            const active = button.item === this.craftingItemId;
            tickItemButton(
                button,
                CRAFTING_COLORS,
                0,
                active ? 0.94 : 1,
                now
            );
            button.button.alpha = lerp(button.button.alpha, active ? 1 : this.craftingItemId === null ? 1 : 0.35, 0.2);
            if (active) {
                button.background.tint = colorLerp(
                    Number(button.background.tint),
                    0xd7a72f,
                    0.2
                );
            }
        }
    }

    resize() {
        this.container.position.set(
            ITEM_BUTTON_SIZE / 2 + this.grid.spacingH,
            ITEM_BUTTON_SIZE / 2 + this.grid.spacingV
        );
    }
}
