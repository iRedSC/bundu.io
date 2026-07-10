import { Container } from "pixi.js";

/**
 * Groups display objects by zIndex layer and tracks them by game-object id.
 */
export class LayeredRenderer {
    container: Container;
    private layers = new Map<number, Container>();
    private byObject = new Map<number, Set<Container>>();

    constructor() {
        this.container = new Container();
        this.container.sortableChildren = true;
    }

    private layer(zIndex: number): Container {
        let layer = this.layers.get(zIndex);
        if (!layer) {
            layer = new Container();
            layer.zIndex = zIndex;
            this.container.addChild(layer);
            this.layers.set(zIndex, layer);
            this.container.sortChildren();
        }
        return layer;
    }

    delete(id: number): void {
        const containers = this.byObject.get(id);
        if (!containers) return;
        for (const child of containers) {
            child.destroy({ children: true });
        }
        this.byObject.delete(id);
    }

    add(id: number, ...containers: Container[]): void {
        let set = this.byObject.get(id);
        if (!set) {
            set = new Set();
            this.byObject.set(id, set);
        }
        for (const child of containers) {
            this.layer(child.zIndex).addChild(child);
            set.add(child);
        }
    }
}
