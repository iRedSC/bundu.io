import {
    craftingButtonContainer,
    filterButtonContainer,
} from "./crafting_menu";
import { Layout } from "@pixi/layout";
import { inventory } from "./inventory";
import { barContainer } from "./statbars";

export const UI = new Layout({
    id: "root",
    content: {
        container1: filterButtonContainer,
        container4: barContainer,
        container2: craftingButtonContainer,
        container3: inventory.display.container,
    },
    styles: {
        background: "red",
    },
});
