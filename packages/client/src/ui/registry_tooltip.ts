import type { RegistryName, ResourceLocation } from "@bundu/shared/registry";
import { AdminPlaceKind } from "@bundu/shared/packet_definitions";
import { tooltipCopy } from "../lang/lang";
import { hideTooltip, moveTooltip, showTooltip } from "./tooltip";

export function placeKindRegistry(kind: AdminPlaceKind): RegistryName {
    switch (kind) {
        case AdminPlaceKind.Resource:
            return "resource";
        case AdminPlaceKind.Structure:
            return "structure";
        case AdminPlaceKind.Ground:
            return "ground_type";
        case AdminPlaceKind.Decoration:
            return "decoration";
        case AdminPlaceKind.Animal:
            return "entity_type";
    }
}

export function showRegistryTooltip(
    registry: RegistryName,
    location: ResourceLocation | string,
    screenX: number,
    screenY: number
): void {
    showTooltip(tooltipCopy(registry, location), screenX, screenY);
}

export function moveRegistryTooltip(screenX: number, screenY: number): void {
    moveTooltip(screenX, screenY);
}

export function hideRegistryTooltip(): void {
    hideTooltip();
}
