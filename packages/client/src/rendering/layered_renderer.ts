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
}
