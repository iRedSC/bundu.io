/**
 * Death / game-over overlay: captured world frame as a drifting B&W backdrop.
 */

import { tOptional } from "../lang/lang";

function element<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id}`);
    return node as T;
}

const screen = element<HTMLElement>("game-over");
const bg = element<HTMLImageElement>("game-over-bg");
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
    // Restart CSS animations when re-shown.
    bg.style.animation = "none";
    void bg.offsetWidth;
    bg.style.animation = "";
    screen.classList.remove("hidden");
}

export function hideGameOver(): void {
    screen.classList.add("hidden");
    bg.removeAttribute("src");
}

export function isGameOverVisible(): boolean {
    return !screen.classList.contains("hidden");
}
