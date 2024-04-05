import { craftingMenu, filterButtons } from "./crafting_menu";
import { barContainer } from "./statbars";
import { Container } from "pixi.js";

export const UI = new Container();
UI.addChild(filterButtons.container);
UI.addChild(barContainer);
UI.addChild(craftingMenu.container);
