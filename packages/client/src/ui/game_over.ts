/**
 * Death / game-over overlay: captured world frame as a drifting B&W backdrop.
 */

import { tOptional } from "../lang/lang";

function element<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id}`);
    return node as T;
}

/** Restart a CSS animation on an element (e.g. after re-showing the overlay). */
function restartAnimation(el: HTMLElement): void {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
}

const screen = element<HTMLElement>("game-over");
const bg = element<HTMLImageElement>("game-over-bg");
const shade = element<HTMLElement>("game-over-shade");
const content = element<HTMLElement>("game-over-content");
const message = element<HTMLElement>("game-over-message");
export const gameOverRespawnButton = element<HTMLButtonElement>(
    "game-over-respawn"
);
export const gameOverMenuButton = element<HTMLButtonElement>("game-over-menu");

function applyCopy(): void {
    message.textContent = tOptional("menu.death_message") ?? "You died";
    gameOverRespawnButton.textContent =
        tOptional("menu.respawn_button") ?? "Respawn";
    gameOverMenuButton.textContent = tOptional("menu.menu_button") ?? "Menu";
}

export function showGameOver(capture: string | null): void {
    applyCopy();
    if (capture) {
        bg.src = capture;
    } else {
        bg.removeAttribute("src");
    }
    restartAnimation(bg);
    restartAnimation(shade);
    restartAnimation(content);
    screen.classList.remove("hidden");
}

export function hideGameOver(): void {
    screen.classList.add("hidden");
    bg.removeAttribute("src");
}

export function isGameOverVisible(): boolean {
    return !screen.classList.contains("hidden");
}
