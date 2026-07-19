import { TextStyle } from "pixi.js";

/** Shared game UI font (leaderboard, nametags, chat, HUD). */
export const UI_FONT = "Arial";

export const TEXT_STYLE = new TextStyle({
    fontFamily: UI_FONT,
    fill: "#ffffff",
    fontSize: 40,
});
