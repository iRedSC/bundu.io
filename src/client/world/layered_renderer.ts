import { Container } from "pixi.js";

type LayerMap = { container: Container; map: Map<number, Set<Container>> };

export class LayeredRenderer {
    container: Container;
    layers: Map<number, LayerMap>;

    constructor() {
        this.container = new Container();
        this.container.sortableChildren = true;
        this.layers = new Map();
    }

    layer(id: number): LayerMap {
        if (!this.layers.has(id)) {
            const layer = { container: new Container(), map: new Map() };
            layer.container.zIndex = id;
            this.container.addChild(layer.container);
            this.layers.set(id, layer);
        }
        this.container.sortChildren();
        return this.layers.get(id)!;
    }

    delete(id: number): void {
        for (const layer of this.layers.values()) {
            const containers = layer.map.get(id) || new Set();
            for (const container of containers.values()) {
                layer.container.removeChild(container);
                layer.map.delete(id);
            }
        }
    }

    add(id: number, ...containers: Container[]): void {
        for (const container of containers) {
            const layer = this.layer(container.zIndex);
            if (!layer.map.has(id)) {
                layer.map.set(id, new Set());
            }
            layer.map.get(id)!.add(container);
            layer.container.addChild(container);
        }
    }

    cleanLayer(layerId: number) {
        const layer = this.layer(layerId);
        for (const object of layer.map.values()) {
            for (const container of object.values()) {
                if (container.destroyed === true) {
                    object.delete(container);
                }
            }
        }
    }

    cleanObject(objectId: number) {
        for (const layer of this.layers.values()) {
            const object = layer.map.get(objectId);
            if (!object) {
                continue;
            }
            for (const container of object.values()) {
                if (container.destroyed === true) {
                    object.delete(container);
                }
            }
        }
    }
}
