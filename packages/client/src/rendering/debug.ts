import { Container } from "pixi.js";

// Used for creating debug objects on the map, such as hitboxes or id text.

export const debugContainer = new Container();
debugContainer.zIndex = 1000;

export class DebugWorldObject {
    containers: Map<string, Container>;

    constructor() {
        this.containers = new Map();
    }

    update(value: string, container: Container) {
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

    destroy() {
        for (const container of this.containers.values()) {
            debugContainer.removeChild(container);
            container.destroy();
        }
        this.containers.clear();
    }
}
