/**
 * Arrange UI elements.
 */

import { Container } from "pixi.js";
import { percentOf } from "@bundu/shared/math";
import { Grid } from "./grid";
import { CraftingMenu, RecipeManager } from "./crafting_menu";
import { Inventory } from "./inventory";
import { StatBar } from "./statbars";
import { Leaderboard } from "./leaderboard";
import { ITEM_BUTTON_SIZE } from "../constants";

export type UI = {
    container: Container;
    inventory: Inventory;
    craftingMenu: CraftingMenu;
    recipeManager: RecipeManager;
    health: StatBar;
    hunger: StatBar;
    heat: StatBar;
    leaderboard: Leaderboard;
    tick: (now?: number) => void;
    destroy: () => void;
};

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

    const statsGrid = new Grid(60, 5, 150, 60, 1);

    const health = new StatBar({
        max: 200,
        icon: "health_bar_icon",
        tint: 0x88fa57,
        overlayTint: 0x37ad98,
        diffTint: 0xd4ffe4,
        split: false,
    });

    const hunger = new StatBar({
        max: 200,
        split: true,
        icon: "hunger_bar_icon",
        tint: 0xb06b30,
        overlayTint: 0xd48457,
        diffTint: 0x6e5648,
    });

    const heat = new StatBar({
        max: 200,
        split: true,
        icon: "heat_bar_icon",
        tint: 0xb85a48,
        overlayTint: 0xb02a2a,
        diffTint: 0x5f7b85,
    });
    const leaderboard = new Leaderboard();

    const statContainer = new Container();
    statContainer.pivot.set(statContainer.width / 2, statContainer.height / 2);
    statContainer.addChild(health.container);
    statContainer.addChild(hunger.container);
    statContainer.addChild(heat.container);

    statsGrid.arrange([health.container, hunger.container, heat.container]);

    function resize() {
        craftingMenu.resize();
        inventory.resize();
        leaderboard.resize();
        statContainer.position.set(
            percentOf(50, window.innerWidth) - percentOf(46, (150 + 60) * 3),
            inventory.container.position.y -
                ITEM_BUTTON_SIZE -
                statsGrid.spacingV
        );
    }

    ui.addChild(statContainer);
    ui.addChild(inventory.container);
    ui.addChild(craftingMenu.container);
    ui.addChild(leaderboard.container);

    window.addEventListener("resize", resize);
    resize();

    return {
        container: ui,
        inventory,
        craftingMenu,
        recipeManager,
        health,
        hunger,
        heat,
        leaderboard,
        tick(now?: number) {
            health.tick();
            hunger.tick();
            heat.tick();
            inventory.tick(now);
            craftingMenu.tick(now);
        },
        destroy() {
            window.removeEventListener("resize", resize);
            inventory.destroy();
            for (const button of craftingMenu.buttons) button.destroy();
            craftingMenu.buttons.length = 0;
            leaderboard.clear();
            ui.destroy({ children: true });
        },
    };
}
