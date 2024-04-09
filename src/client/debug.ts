import * as PIXI from "pixi.js";

// ! This thing kinda sucks. Causes a butt ton of lag, needs to be fixed.
// Used for creating debug objects on the map, such as hitboxes or id text.

export const debugContainer = new PIXI.Container();

export class DebugWorldObject {
    containers: Map<string, PIXI.Container>;

    constructor() {
        this.containers = new Map();
    }

    update(value: string, container: PIXI.Container) {
        const current = this.containers.get(value);
        if (!current) {
            this.containers.set(value, container);
            debugContainer.addChild(container);
            return;
        }
        debugContainer.removeChild(current);
        current.destroy();
        this.containers.set(value, container);
        debugContainer.addChild(container);
    }

    set renderable(value: boolean) {
        for (const container of this.containers.values()) {
            container.renderable = value;
        }
    }
}
