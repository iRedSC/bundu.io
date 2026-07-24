import type { TooltipCopy } from "../lang/lang";
import { tooltipCopy } from "../lang/lang";
import { hideTooltip, moveTooltip, showTooltip } from "./tooltip";
import type { Structure } from "../world/objects/structure";
import { clientRegistries } from "../configs/registries";

/** Door / interactable tip — only call when canInteract. */
export function showInteractTooltip(
    structure: Structure,
    screenX: number,
    screenY: number
): void {
    if (structure.typeId < 0) return;
    const location = clientRegistries().structure.location(structure.typeId);
    const copy: TooltipCopy = tooltipCopy("structure", location);
    const open = structure.getState("open") === true;
    const stateLine = open ? "Open" : "Closed";
    const action = open ? "Right-click to close" : "Right-click to open";
    const bodyParts = [copy.body, stateLine].filter(Boolean);
    showTooltip(
        {
            title: copy.title,
            body: bodyParts.length > 0 ? bodyParts.join("\n") : undefined,
            footer: action,
        },
        screenX,
        screenY
    );
}

export function moveInteractTooltip(screenX: number, screenY: number): void {
    moveTooltip(screenX, screenY);
}

export function hideInteractTooltip(): void {
    hideTooltip();
}
