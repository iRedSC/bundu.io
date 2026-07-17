import type { Container } from "pixi.js";

/**
 * Tracks display objects by game-object id for teardown.
 * Parents them under a sortable Pixi container so zIndex does the layering.
 */
export class LayeredRenderer {
    private byObject = new Map<number, Set<Container>>();

    constructor(private parent: Container) {}

    delete(id: number): void {
        const containers = this.byObject.get(id);
        if (!containers) return;
        for (const child of containers) {
            child.destroy({ children: true });
        }
        this.byObject.delete(id);
    }

    /** Destroy one tracked display object without clearing the rest of the id. */
    remove(id: number, container: Container): void {
        const containers = this.byObject.get(id);
        if (!containers?.has(container)) return;
        containers.delete(container);
        container.destroy({ children: true });
        if (containers.size === 0) this.byObject.delete(id);
    }

    add(id: number, ...containers: Container[]): void {
        let set = this.byObject.get(id);
        if (!set) {
            set = new Set();
            this.byObject.set(id, set);
        }
        for (const child of containers) {
            this.parent.addChild(child);
            set.add(child);
        }
    }

    /** Swap display objects for an id; destroys previous ones not in the new set. */
    replace(id: number, ...containers: Container[]): void {
        const prev = this.byObject.get(id);
        const next = new Set(containers);
        if (prev) {
            for (const child of prev) {
                if (!next.has(child)) child.destroy({ children: true });
            }
        }
        for (const child of containers) {
            this.parent.addChild(child);
        }
        this.byObject.set(id, next);
    }
}
