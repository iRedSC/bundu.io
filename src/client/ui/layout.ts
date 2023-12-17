import {
    craftingMenu,

    filterButtons,
} from "./crafting_menu";
import { Layout } from "@pixi/layout";
import { inventory } from "./inventory";
import { barContainer } from "./statbars";

export const UI = new Layout({
    id: "root",
    content: {
        container1: filterButtons.container,
        container4: barContainer,
        container2: craftingMenu.container,
        container3: inventory.display.container,
    },
    styles: {
        background: "red",
    },
});
