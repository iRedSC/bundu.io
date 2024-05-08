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
import { ITEM_BUTTON_SIZE } from "../constants";
import { Minimap } from "./minimap";

export function createUI() {
    const ui = new Container();

    const inventory = new Inventory();

    const recipeManager = new RecipeManager();

    const craftingGrid = new Grid(
        percentOf(10, ITEM_BUTTON_SIZE),
        percentOf(10, ITEM_BUTTON_SIZE),
        ITEM_BUTTON_SIZE,
        ITEM_BUTTON_SIZE,
        3
    );
    const craftingMenu = new CraftingMenu(craftingGrid);

    const swordTimer = new Timer("sword_timer");

    const statsGrid = new Grid(60, 5, 150, 60, 1);

    const health = new StatBar({
        max: 200,
        icon: "health_bar_icon",
        tint: 0x88fa57,
        overlayTint: 0x37ad98,
        diffTint: 0xd4ffe4,
        warnOnHigh: false,
        split: false,
    });

    const hunger = new StatBar({
        max: 100,
        split: false,
        icon: "hunger_bar_icon",
        tint: 0xb06b30,
        overlayTint: 0xd48457,
        diffTint: 0x6e5648,

        warnOnHigh: false,
    });

    const heat = new StatBar({
        max: 200,
        split: true,
        icon: "heat_bar_icon",
        tint: 0xb85a48,
        overlayTint: 0xb02a2a,
        diffTint: 0x5f7b85,
    });

    const statContainer = new Container();
    statContainer.pivot.set(statContainer.width / 2, statContainer.height / 2);
    statContainer.addChild(health.container);
    statContainer.addChild(hunger.container);
    statContainer.addChild(heat.container);

    statsGrid.arrange([health.container, hunger.container, heat.container]);

    const minimap = new Minimap();

    function resize() {
        minimap.resize();
        craftingMenu.resize();
        inventory.resize();
        statContainer.position.set(
            percentOf(50, window.innerWidth) - percentOf(46, (150 + 60) * 3),
            inventory.container.position.y -
                ITEM_BUTTON_SIZE -
                statsGrid.spacingV
        );
        swordTimer.container.position.set(
            100,
            percentOf(75, window.innerHeight)
        );
    }
    window.addEventListener("resize", resize);

    ui.addChild(minimap.container);
    ui.addChild(statContainer);
    ui.addChild(inventory.container);
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
        minimap,
    };
}
