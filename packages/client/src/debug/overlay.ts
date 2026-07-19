import { Container, Graphics, Text } from "pixi.js";
import type { BasicPoint } from "@bundu/shared";
import { TEXT_STYLE } from "@client/assets/text";
import { Circle } from "./circle";
import type { ObjectDebug, ObjectDebugInit } from "./types";

/** World-space layer for debug hitbox overlays. */
export const debugContainer = new Container();
debugContainer.zIndex = 1000;
debugContainer.sortableChildren = true;

const hitboxLayer = new Container();
hitboxLayer.label = "debug-hitbox-layer";
hitboxLayer.zIndex = 1;
hitboxLayer.eventMode = "none";
hitboxLayer.sortableChildren = true;
hitboxLayer.visible = true;

debugContainer.addChild(hitboxLayer);

const hitboxListeners = new Set<(visible: boolean) => void>();

const ATTACK_HITBOX_MS = 200;

/** Ephemeral attack SAT polygon (world-space corners). */
export function drawAttackHitbox(points: BasicPoint[]) {
    if (points.length < 3 || !hitboxLayer.visible) return;

    const first = points[0];
    if (!first) return;

    const g = new Graphics();
    g.eventMode = "none";
    g.zIndex = 10;
    g.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
        const p = points[i];
        if (!p) continue;
        g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.fill({ color: 0x22c55e, alpha: 0.2 });
    g.stroke({ width: 2, color: 0x22c55e, alpha: 0.9, pixelLine: true });
    hitboxLayer.addChild(g);

    setTimeout(() => {
        if (g.destroyed) return;
        hitboxLayer.removeChild(g);
        g.destroy();
    }, ATTACK_HITBOX_MS);
}

class DebugWorldObject implements ObjectDebug {
    readonly containers = new Map<string, Container>();
    private locationText?: Text;

    update(key: string, container: Container) {
        const current = this.containers.get(key);
        if (current) {
            hitboxLayer.removeChild(current);
            current.destroy();
        }
        this.containers.set(key, container);
        hitboxLayer.addChild(container);
    }

    set renderable(value: boolean) {
        for (const container of this.containers.values()) {
            container.renderable = value;
        }
    }

    destroy() {
        for (const container of this.containers.values()) {
            hitboxLayer.removeChild(container);
            container.destroy();
        }
        this.containers.clear();
    }

    sync(x: number, y: number, locationText?: string) {
        if (locationText !== undefined && this.locationText) {
            this.locationText.text = locationText;
            this.locationText.position.set(x, y - 10);
        }
        this.containers.get("hitbox")?.position.set(x, y);
        this.containers.get("id")?.position.set(x, y);
    }

    setLocationText(text: Text) {
        this.locationText = text;
    }
}

export function createObjectDebug(init: ObjectDebugInit): ObjectDebug {
    const debug = new DebugWorldObject();

    const idText = new Text(`ID: ${init.id}`, TEXT_STYLE);
    idText.scale.set(0.34);
    idText.position.set(init.position.x, init.position.y);
    debug.update("id", idText);

    const locationText = new Text(
        ` ${init.position.x}, ${init.position.y}`,
        TEXT_STYLE
    );
    locationText.scale.set(0.34);
    locationText.position.set(init.position.x, init.position.y - 10);
    debug.setLocationText(locationText);
    debug.update("location", locationText);

    debug.update(
        "hitbox",
        new Circle(init.position, init.collisionRadius, 0xff0000, 2)
    );

    return debug;
}

export function setDebugHitboxesVisible(visible: boolean) {
    if (hitboxLayer.visible === visible) return;
    hitboxLayer.visible = visible;
    for (const listener of hitboxListeners) listener(visible);
}

export function isDebugHitboxesVisible() {
    return hitboxLayer.visible;
}

export function onDebugHitboxesVisibleChange(
    listener: (visible: boolean) => void
): () => void {
    hitboxListeners.add(listener);
    return () => {
        hitboxListeners.delete(listener);
    };
}
