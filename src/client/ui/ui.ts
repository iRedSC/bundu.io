/**
 * Arrange UI elements.
 */

import { Container } from "pixi.js";
import { percentOf } from "../../lib/math";
import { Timer } from "./timer";
import { Grid } from "./grid";
import { CraftingMenu, RecipeManager } from "./crafting_menu";
import { Inventory } from "./inventory";
import { StatBar } from "./statbars";

export function createUI() {
    const ui = new Container();

    const inventory = new Inventory();

    const recipeManager = new RecipeManager();

    const craftingGrid = new Grid(6, 6, 68, 68, 3);
    const craftingMenu = new CraftingMenu(craftingGrid);

    const swordTimer = new Timer("sword_timer");

    function resize() {
        craftingMenu.resize();
        inventory.display.resize();
        swordTimer.container.position.set(
            100,
            percentOf(75, window.innerHeight)
        );
    }
    window.addEventListener("resize", resize);

    const health = new StatBar({
        min: 0,
        max: 200,
        median: 100,
        decor: "health_bar_decor",
        baseColor: 0x88fa57,
        overlayColor: 0x37ad98,
        warningColor: 0xfa7a57,
        diffColor: 0xd4ffe4,
    });
    health.container.position.set(
        percentOf(50, window.innerWidth),
        percentOf(50, window.innerHeight)
    );

    ui.addChild(health.container);
    ui.addChild(inventory.display.container);
    ui.addChild(swordTimer.container);
    ui.addChild(craftingMenu.container);

    return { ui, inventory, craftingMenu, recipeManager, swordTimer, health };
}
