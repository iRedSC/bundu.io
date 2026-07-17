import type { Container } from "pixi.js";
import { registerAttackHitboxDrawer } from "./attack_hitbox";
import { registerObjectDebugFactory } from "./object_debug";
import {
    createObjectDebug,
    debugContainer,
    drawAttackHitbox,
    isDebugHitboxesVisible,
    setDebugHitboxesVisible,
} from "./overlay";

const TOOLS_CSS = `
.debug-tools {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.35rem;
    background: rgba(12, 18, 14, 0.82);
    border: 1px solid rgba(242, 240, 228, 0.12);
    min-width: 11rem;
}
.debug-tools-title {
    margin: 0 0 0.15rem;
    font-family: "Nunito", sans-serif;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(242, 240, 228, 0.65);
}
.debug-tool-btn {
    margin-left: 0;
    width: 100%;
    background-color: #214f2c;
    font-size: 0.85rem;
    border: none;
    color: #f2f0e4;
    padding: 0.45rem 0.75rem;
    border-radius: 0.3rem;
    cursor: pointer;
    font-family: "Nunito", sans-serif;
}
.debug-tool-btn[aria-pressed="false"] {
    background-color: #333333;
    opacity: 0.85;
}
`;

export type ClientDebugHandle = Record<string, never>;

function bindToggle(
    button: HTMLButtonElement,
    label: string,
    initial: boolean,
    onChange: (active: boolean) => void
) {
    const setActive = (active: boolean) => {
        button.textContent = `${label}: ${active ? "On" : "Off"}`;
        button.ariaPressed = String(active);
        onChange(active);
    };
    button.addEventListener("pointerdown", (e) => e.stopPropagation());
    button.addEventListener("pointerup", (e) => e.stopPropagation());
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        setActive(button.ariaPressed !== "true");
    });
    setActive(initial);
}

/**
 * Mounts the Debug tools panel + world overlay.
 * Only imported when `__DEBUG__` is true (see client entry).
 */
export function mountClientDebug(viewport: Container): ClientDebugHandle {
    registerObjectDebugFactory(createObjectDebug);
    registerAttackHitboxDrawer(drawAttackHitbox);
    viewport.addChild(debugContainer);

    const style = document.createElement("style");
    style.setAttribute("data-bundu-debug", "1");
    style.textContent = TOOLS_CSS;
    document.head.appendChild(style);

    const panel = document.createElement("aside");
    panel.id = "debug-tools";
    panel.className = "debug-tools";
    panel.setAttribute("aria-label", "Debug tools");
    panel.innerHTML = `
        <h2 class="debug-tools-title">Debug tools</h2>
        <button id="debug-hitboxes" class="debug-tool-btn" type="button">Hitboxes: On</button>
    `;
    document.body.appendChild(panel);

    const hitboxesToggle = panel.querySelector<HTMLButtonElement>("#debug-hitboxes");

    if (hitboxesToggle) {
        bindToggle(
            hitboxesToggle,
            "Hitboxes",
            isDebugHitboxesVisible(),
            (visible) => {
                setDebugHitboxesVisible(visible);
            }
        );
    }

    return {};
}
