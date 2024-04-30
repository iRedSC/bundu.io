/**
 * Arrange UI elements.
 */

import { Container } from "pixi.js";
import { percentOf } from "../../lib/math";
import { Timer } from "./timer";
import { Grid } from "./grid";
import { CraftingMenu, RecipeManager } from "./crafting_menu";
import { INVENTORY_SLOT_SIZE, Inventory } from "./inventory";
import { StatBar } from "./statbars";

export function createUI() {
    const ui = new Container();

    const inventory = new Inventory();

    const recipeManager = new RecipeManager();

    const craftingGrid = new Grid(6, 6, 68, 68, 3);
    const craftingMenu = new CraftingMenu(craftingGrid);

    const swordTimer = new Timer("sword_timer");

    const statsGrid = new Grid(6, 16, 250, 60, 1);

    const health = new StatBar({
        min: 0,
        max: 200,
        median: 200,
        decor: "health_bar_decor",
        baseColor: 0x88fa57,
        overlayColor: 0x37ad98,
        warningColor: 0xfa7a57,
        diffColor: 0xd4ffe4,

        warnOnHigh: false,
    });

    const hunger = new StatBar({
        min: 0,
        max: 200,
        median: 200,
        decor: "hunger_bar_decor",
        baseColor: 0xb06b30,
        overlayColor: 0xd48457,
        warningColor: 0x757474,
        diffColor: 0x6e5648,

        warnOnHigh: false,
    });

    const heat = new StatBar({
        min: 0,
        max: 200,
        median: 100,
        decor: "heat_bar_decor",
        baseColor: 0xb85a48,
        overlayColor: 0xb02a2a,
        warningColor: 0xbc44c7,
        diffColor: 0x5f7b85,
    });

    const statContainer = new Container();
    statContainer.pivot.set(statContainer.width / 2, statContainer.height / 2);
    statContainer.addChild(health.container);
    statContainer.addChild(hunger.container);
    statContainer.addChild(heat.container);

    statsGrid.arrange([health.container, hunger.container, heat.container]);

    function resize() {
        craftingMenu.resize();
        inventory.display.resize();
        statContainer.position.set(
            percentOf(50, window.innerWidth) - percentOf(46, (250 + 6) * 3),
            inventory.display.container.position.y -
                INVENTORY_SLOT_SIZE -
                statsGrid.spacingV
        );
        swordTimer.container.position.set(
            100,
            percentOf(75, window.innerHeight)
        );
    }
    window.addEventListener("resize", resize);

    ui.addChild(statContainer);
    ui.addChild(inventory.display.container);
    ui.addChild(swordTimer.container);
    ui.addChild(craftingMenu.container);

    return {
        container: ui,
        inventory,
        craftingMenu,
        recipeManager,
        swordTimer,
        health,
        hunger,
        heat,
    };
}
