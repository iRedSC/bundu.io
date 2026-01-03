import { Quadtree, type BasicPoint } from "@ioengine/lib";
import GameObject from "./game_object";

export default class ObjectContainer {
    objects: Map<number, GameObject>;
    updating: Set<GameObject>;
    quadtree: Quadtree;

    constructor(bounds: [BasicPoint, BasicPoint]) {
        this.objects = new Map();
        this.updating = new Set();
        this.quadtree = new Quadtree(new Map(), bounds, 100);
    }

    /**
     * Add an object to this container.
     * @param object Object to add to container
     */
    add(object: GameObject): void {
        this.objects.set(object.id, object);
        this.quadtree.insert(object.id, object.position);
        this.updating.add(object);
    }

    /**
     * Remove an object from this container
     * @param object Object or ID to remove from container
     */
    delete(object: GameObject | number): void {
        if (typeof object === "number") {
            const existing = this.objects.get(object);
            if (!existing) {
                return;
            }
            this.updating.delete(existing);
            this.quadtree.delete(object);
            this.objects.delete(object);
            return;
        }

        this.updating.delete(object);
        this.quadtree.delete(object.id);
        this.objects.delete(object.id);
    }

    /**
     * Update objects in the updating set.
     */
    update(now: number): void {
        for (const object of this.updating.values()) {
            const done = object.update(now);
            if (done) this.updating.delete(object);
        }
    }

    get(id: number) {
        return this.objects.get(id);
    }

    query(bounds: [BasicPoint, BasicPoint]) {
        return this.quadtree.query(bounds);
    }

    all() {
        return this.objects.values();
    }
}
