import { Container } from "pixi.js";

interface IDContainer extends Container {
    id: number;
}

type LayerMap = { container: Container; map: Map<number, IDContainer> };

export class LayeredRenderer {
    layers: Map<number, LayerMap>;

    constructor() {
        this.layers = new Map();
    }

    layer(id: number): LayerMap {
        if (!this.layers.has(id)) {
            const layer = { container: new Container(), map: new Map() };
            this.layers.set(id, layer);
        }
        return this.layers.get(id)!;
    }

    remove(id: number): boolean {
        for (const layer of this.layers.values()) {
            const container = layer.map.get(id);
            if (container) {
                layer.container.removeChild(container);
                layer.map.delete(id);
                return true;
            }
        }
        return false;
    }

    add(...containers: IDContainer[]): void {
        for (const container of containers) {
            const layer = this.layer(container.zIndex);
            layer.map.set(container.id, container);
            layer.container.addChild(container);
        }
    }
}
