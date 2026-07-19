/**
 * Shared full-screen loading overlay: status text + progress bar.
 * Used for resource packs, world/terrain prep, etc.
 */

export type LoadingProgress = {
    /** 0..1 */
    progress: number;
    status: string;
    title?: string;
};

function element<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id}`);
    return node as T;
}

const screen = element<HTMLElement>("loading-screen");
const titleEl = element<HTMLElement>("loading-title");
const statusEl = element<HTMLElement>("loading-status");
const barFill = element<HTMLElement>("loading-bar-fill");
const errorScreen = element<HTMLElement>("loading-error");
const errorMessage = element<HTMLElement>("loading-error-message");
export const loadingRetryButton = element<HTMLButtonElement>(
    "loading-retry-button"
);
export const loadingBackButton = element<HTMLButtonElement>(
    "loading-back-button"
);

const DEFAULT_TITLE = "Loading…";

export function showLoading(update?: Partial<LoadingProgress>): void {
    errorScreen.classList.add("hidden");
    screen.classList.remove("hidden");
    if (update) setLoadingProgress(update);
}

export function setLoadingProgress(update: Partial<LoadingProgress>): void {
    if (update.title !== undefined) titleEl.textContent = update.title;
    if (update.status !== undefined) statusEl.textContent = update.status;
    if (update.progress !== undefined) {
        const p = Math.max(0, Math.min(1, update.progress));
        barFill.style.width = `${(p * 100).toFixed(1)}%`;
        screen.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    }
}

export function hideLoading(): void {
    screen.classList.add("hidden");
    errorScreen.classList.add("hidden");
    titleEl.textContent = DEFAULT_TITLE;
    statusEl.textContent = "";
    barFill.style.width = "0%";
}

export function showLoadingError(error: unknown, title = "Something went wrong"): void {
    screen.classList.add("hidden");
    element<HTMLElement>("loading-error-title").textContent = title;
    errorMessage.textContent =
        error instanceof Error
            ? error.message
            : String(error || "Start the game server and try again.");
    errorScreen.classList.remove("hidden");
}

export function isLoadingVisible(): boolean {
    return !screen.classList.contains("hidden");
}

/** True when the loading or error overlay is showing (exclude from menu toggles). */
export function isLoadingOverlay(el: Element): boolean {
    return el.id === "loading-screen" || el.id === "loading-error";
}
