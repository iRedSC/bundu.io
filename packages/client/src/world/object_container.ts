import GameObject from "./game_object";

/** Simple id → object map with an updating set for interpolation. */
export default class ObjectContainer {
    objects: Map<number, GameObject>;
    updating: Set<GameObject>;

    constructor() {
        this.objects = new Map();
        this.updating = new Set();
    }

    add(object: GameObject): void {
        this.objects.set(object.id, object);
        this.updating.add(object);
    }

    delete(object: GameObject | number): void {
        if (typeof object === "number") {
            const existing = this.objects.get(object);
            if (!existing) return;
            this.updating.delete(existing);
            this.objects.delete(object);
            return;
        }

        this.updating.delete(object);
        this.objects.delete(object.id);
    }

    update(now: number): void {
        for (const object of this.updating.values()) {
            const done = object.update(now);
            if (done) this.updating.delete(object);
        }
    }

    get(id: number) {
        return this.objects.get(id);
    }

    all() {
        return this.objects.values();
    }
}
