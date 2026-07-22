/**
 * Arrange UI elements.
 */

import { ColorMatrixFilter, Container } from "pixi.js";
import { percentOf } from "@bundu/shared/math";
import { lerp } from "@bundu/shared/transforms";
import { Grid } from "./grid";
import { CraftingMenu, RecipeManager } from "./crafting_menu";
import { Inventory } from "./inventory";
import { StatBar } from "./statbars";
import { getStatBarsConfig } from "./stat_bars_config";
import { Leaderboard } from "./leaderboard";
import { ITEM_BUTTON_SIZE } from "../constants";

/** Screen-space footprint of one vertical bar (matches scale 175 ≈). */
const BAR_W = 48;
const BAR_H = 175;
const BAR_GAP = 0;
/** Gap between vitals row right edge and hotbar left edge. */
const HOTBAR_GAP = 8;
/** Raise bottom-aligned bars a touch above the hotbar baseline. */
const HOTBAR_LIFT = 12;

/** Hotbar + vitals while freecam is active (still readable). */
const FREECAM_HUD_ALPHA = 0.42;
/** Further fade when the pointer is over them so the world peeks through. */
const FREECAM_HUD_HOVER_ALPHA = 0.12;
const FREECAM_HUD_ALPHA_LERP = 0.18;

export type UI = {
    container: Container;
    inventory: Inventory;
    craftingMenu: CraftingMenu;
    recipeManager: RecipeManager;
    health: StatBar;
    hunger: StatBar;
    heat: StatBar;
    thirst: StatBar;
    leaderboard: Leaderboard;
    /** Gray + fade hotbar/vitals instead of hiding the whole HUD. */
    setFreecamDimmed: (enabled: boolean) => void;
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

    const bars = getStatBarsConfig();
    const health = new StatBar(bars.health);
    const hunger = new StatBar(bars.hunger);
    const thirst = new StatBar(bars.thirst);
    const heat = new StatBar(bars.heat);
    const leaderboard = new Leaderboard();

    // Right-aligned: health nearest hotbar; extra bars grow leftward.
    const fromRight = [health, hunger, thirst, heat];
    const statContainer = new Container();
    for (const [i, bar] of fromRight.entries()) {
        statContainer.addChild(bar.container);
        // i=0 at x=0 (rightmost); others step left.
        bar.container.position.set(-i * (BAR_W + BAR_GAP), 0);
    }

    function layoutVitals() {
        // Right edge of the vitals row sits just left of the hotbar's left edge.
        // Fixed footprint — shaking bars must not change getLocalBounds and shift us.
        const hotbarLeft =
            inventory.container.position.x - ITEM_BUTTON_SIZE / 2;
        const rightEdge = BAR_W / 2;
        statContainer.position.set(
            hotbarLeft - HOTBAR_GAP - rightEdge,
            inventory.container.position.y +
                ITEM_BUTTON_SIZE / 2 -
                BAR_H / 2 -
                HOTBAR_LIFT
        );
    }

    function resize() {
        craftingMenu.resize();
        inventory.resize();
        leaderboard.resize();
        layoutVitals();
    }

    ui.addChild(statContainer);
    ui.addChild(inventory.container);
    ui.addChild(craftingMenu.container);
    ui.addChild(leaderboard.container);

    let freecamDimmed = false;
    let pointerX = 0;
    let pointerY = 0;
    let savedLeaderboardVisible = true;
    const invGray = new ColorMatrixFilter();
    invGray.greyscale(1, false);
    const statGray = new ColorMatrixFilter();
    statGray.greyscale(1, false);

    const dimRoots = [statContainer, inventory.container];

    const onPointerMove = (ev: PointerEvent) => {
        pointerX = ev.clientX;
        pointerY = ev.clientY;
    };

    function pointerOverDimmedHud(): boolean {
        for (const root of dimRoots) {
            if (root.getBounds().containsPoint(pointerX, pointerY)) return true;
        }
        return false;
    }

    function setFreecamDimmed(enabled: boolean) {
        freecamDimmed = enabled;
        if (enabled) {
            savedLeaderboardVisible = leaderboard.container.visible;
            leaderboard.container.visible = false;
            // Crafting visibility is owned by syncCreativeChrome (creative + freecam).
            craftingMenu.container.visible = false;
            inventory.container.filters = [invGray];
            statContainer.filters = [statGray];
            inventory.setPointerMuted(true);
        } else {
            leaderboard.container.visible = savedLeaderboardVisible;
            // Do not force crafting visible — creative mode may still own that.
            inventory.container.filters = null;
            statContainer.filters = null;
            inventory.container.alpha = 1;
            statContainer.alpha = 1;
            inventory.setPointerMuted(false);
        }
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    resize();

    return {
        container: ui,
        inventory,
        craftingMenu,
        recipeManager,
        health,
        hunger,
        heat,
        thirst,
        leaderboard,
        setFreecamDimmed,
        tick(now?: number) {
            // Inventory recenters when slots arrive — keep vitals glued to it.
            layoutVitals();
            if (freecamDimmed) {
                const target = pointerOverDimmedHud()
                    ? FREECAM_HUD_HOVER_ALPHA
                    : FREECAM_HUD_ALPHA;
                for (const root of dimRoots) {
                    root.alpha = lerp(root.alpha, target, FREECAM_HUD_ALPHA_LERP);
                }
            }
            health.tick();
            hunger.tick();
            thirst.tick();
            heat.tick();
            inventory.tick(now);
            craftingMenu.tick(now);
        },
        destroy() {
            window.removeEventListener("resize", resize);
            window.removeEventListener("pointermove", onPointerMove);
            inventory.destroy();
            for (const button of craftingMenu.buttons) button.destroy();
            craftingMenu.buttons.length = 0;
            leaderboard.clear();
            ui.destroy({ children: true });
        },
    };
}
