import { Container, Graphics, Text } from "pixi.js";
import { TILE_SIZE, WORLD_BOUNDS } from "@bundu/shared/tiles";
import { TEXT_STYLE } from "@client/assets/text";
import { Circle } from "./circle";
import type { ObjectDebug, ObjectDebugInit } from "./types";

/** World-space layer for all debug overlays (grid, hitboxes, labels). */
export const debugContainer = new Container();
debugContainer.zIndex = 1000;
debugContainer.addChild(createDebugGrid());

function createDebugGrid(): Graphics {
    const grid = new Graphics();
    grid.label = "debug-grid";
    grid.zIndex = -1;
    grid.eventMode = "none";

    for (let x = 0; x <= WORLD_BOUNDS; x += TILE_SIZE) {
        grid.moveTo(x, 0);
        grid.lineTo(x, WORLD_BOUNDS);
    }
    for (let y = 0; y <= WORLD_BOUNDS; y += TILE_SIZE) {
        grid.moveTo(0, y);
        grid.lineTo(WORLD_BOUNDS, y);
    }
    grid.stroke({ width: 1, color: 0xffffff, alpha: 0.2 });
    return grid;
}

class DebugWorldObject implements ObjectDebug {
    readonly containers = new Map<string, Container>();
    private locationText?: Text;

    update(key: string, container: Container) {
        const current = this.containers.get(key);
        if (current) {
            debugContainer.removeChild(current);
            current.destroy();
        }
        this.containers.set(key, container);
        debugContainer.addChild(container);
    }

    set renderable(value: boolean) {
        for (const container of this.containers.values()) {
            container.renderable = value;
        }
    }

    destroy() {
        for (const container of this.containers.values()) {
            debugContainer.removeChild(container);
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

export function setDebugOverlayVisible(visible: boolean) {
    debugContainer.visible = visible;
}

export function isDebugOverlayVisible() {
    return debugContainer.visible;
}
