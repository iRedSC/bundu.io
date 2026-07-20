import { ItemButton, tickItemButton } from "./item_button";
import type { Grid } from "./grid";
import { ITEM_BUTTON_SIZE } from "../constants";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { Container } from "pixi.js";
import { colorLerp, lerp } from "@bundu/shared/transforms";
import { clientRegistries } from "../configs/registries";
import {
    hideRegistryTooltip,
    moveRegistryTooltip,
    showRegistryTooltip,
} from "./registry_tooltip";

const CRAFTING_COLORS = {
    empty: 0x777777,
    default: 0x777777,
    hover: 0x999999,
    down: 0x333333,
    rightDown: 0x333333,
} as const;

export type RecipeView = {
    recipeId: number;
    resultItemId: number;
    resultAmount: number;
};

type Recipe = RecipeView & {
    ingredients: Map<number, number>;
    flags: number[];
};

export class RecipeManager {
    recipes = new Map<number, Recipe>();

    updateRecipes({ recipes }: ServerPacket.RecipeList) {
        this.recipes.clear();
        for (const [recipeId, resultItemId, resultAmount, ingredients, flags] of recipes) {
            this.recipes.set(recipeId, {
                recipeId,
                resultItemId,
                resultAmount,
                ingredients: new Map(ingredients),
                flags: [...flags],
            });
        }
    }

    filter(items: Map<number, number>, flags: number[]): RecipeView[] {
        const craftable: RecipeView[] = [];
        const availableFlags = new Set(flags);
        nextRecipe: for (const recipe of this.recipes.values()) {
            for (const flag of recipe.flags) {
                if (!availableFlags.has(flag)) continue nextRecipe;
            }
            for (const [id, recipeAmount] of recipe.ingredients) {
                if ((items.get(id) ?? 0) < recipeAmount) continue nextRecipe;
            }
            craftable.push({
                recipeId: recipe.recipeId,
                resultItemId: recipe.resultItemId,
                resultAmount: recipe.resultAmount,
            });
        }
        return craftable;
    }
}

type Callback = (recipeId: number, shift: boolean) => void;

export class CraftingMenu {
    buttons: ItemButton[] = [];
    items: RecipeView[] = [];
    container = new Container();
    rows = 0;
    private rightClickCB?: Callback;
    private leftClickCB?: Callback;
    craftingRecipeId: number | null = null;
    private hoverScreen: { x: number; y: number } | null = null;

    constructor(readonly grid: Grid) {}

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
                this.container.addChild(button.button);
                this.buttons.push(button);
            }
        }
        this.grid.arrange(this.buttons);
        this.resize();
        for (const [i, button] of this.buttons.entries()) {
            const recipe = this.items[i];
            button.item = recipe?.resultItemId ?? null;
            button.rightclick = (_item, shift) => {
                hideRegistryTooltip();
                if (recipe) this.rightClickCB?.(recipe.recipeId, shift);
            };
            button.leftclick = (_item, shift) => {
                hideRegistryTooltip();
                if (recipe) this.leftClickCB?.(recipe.recipeId, shift);
            };
            button.onHover = (hovering, ev) => {
                if (!hovering || !recipe || !ev) {
                    this.hoverScreen = null;
                    hideRegistryTooltip();
                    return;
                }
                this.hoverScreen = { x: ev.global.x, y: ev.global.y };
                showRegistryTooltip(
                    "item",
                    clientRegistries().item.location(recipe.resultItemId),
                    ev.global.x,
                    ev.global.y
                );
            };
            button.onHoverMove = (ev) => {
                this.hoverScreen = { x: ev.global.x, y: ev.global.y };
                if (!recipe) return;
                moveRegistryTooltip(ev.global.x, ev.global.y);
            };
        }
        // Inventory/flags refresh rebuilds buttons; restore tip if still hovering.
        const hoverIndex = this.buttons.findIndex((button) => button.hovering);
        const hovered = hoverIndex >= 0 ? this.items[hoverIndex] : undefined;
        if (hovered && this.hoverScreen) {
            showRegistryTooltip(
                "item",
                clientRegistries().item.location(hovered.resultItemId),
                this.hoverScreen.x,
                this.hoverScreen.y
            );
        } else if (hoverIndex < 0) {
            hideRegistryTooltip();
        }
    }

    set rightclick(value: Callback) {
        this.rightClickCB = value;
    }

    set leftclick(value: Callback) {
        this.leftClickCB = value;
    }

    tick(now?: number) {
        for (const [index, button] of this.buttons.entries()) {
            const active =
                this.items[index]?.recipeId === this.craftingRecipeId;
            tickItemButton(
                button,
                CRAFTING_COLORS,
                0,
                active ? 0.94 : 1,
                now
            );
            button.button.alpha = lerp(
                button.button.alpha,
                active ? 1 : this.craftingRecipeId === null ? 1 : 0.35,
                0.2
            );
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
