import type { Container } from "pixi.js";
import type { BasicPoint } from "@bundu/shared";

/** Per-entity debug visuals (hitbox, id, etc.). No-op in prod builds. */
export type ObjectDebug = {
    update(key: string, container: Container): void;
    renderable: boolean;
    destroy(): void;
    /** Sync overlay pieces that follow the entity. */
    sync(x: number, y: number, locationText?: string): void;
};

export type ObjectDebugInit = {
    id: number;
    position: BasicPoint;
    collisionRadius: number;
};

export const noopObjectDebug: ObjectDebug = {
    update() {},
    renderable: false,
    destroy() {},
    sync() {},
};
