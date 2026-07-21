import type { Container } from "pixi.js";

/**
 * Shared surface for freecam admin / creative (and future) mode UIs.
 * Modes own their toolbar + sidebar; the shell only needs activate/hit-test.
 */
export type ModeUi = {
    container: Container;
    setActive: (enabled: boolean) => void;
    isActive: () => boolean;
    containsPoint: (screenX: number, screenY: number) => boolean;
    tick?: (now?: number) => void;
    destroy: () => void;
};
