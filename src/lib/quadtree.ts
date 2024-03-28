import { Range } from "./range.js";

type Point = { x: number; y: number; [key: string]: any };

type ObjectWithPos = {
    id: number;
    position: Point;
    [key: string]: any;
};

type ObjectList<T extends ObjectWithPos> = Map<number, T>;

export class Quadtree<T extends ObjectWithPos> {
    tree: InternalQuadtree<T>;
    objects: ObjectList<T>;
    constructor(objectList: ObjectList<T>, bounds: Range, maxObjects: number) {
        this.tree = new InternalQuadtree(bounds, maxObjects);
        this.objects = objectList;
    }

    delete(objectID: number) {
        this.objects.delete(objectID);
    }

    get(objectID: number | undefined) {
        if (objectID) {
            return this.objects.get(objectID);
        }
    }

    values() {
        return this.objects.values();
    }

    clear() {
        this.tree.clear();
    }

    insert(object: T) {
        this.objects.set(object.id, object);
        this.tree.insert(object.id, this.objects);
    }

    query(range: Range) {
        return this.tree.query(range, this.objects);
    }

    rebuild() {
        this.tree.rebuild(this.objects);
    }
}

class InternalQuadtree<T extends ObjectWithPos> {
    bounds: Range;
    maxObjects: number;
    level: number;
    objects: Set<number>;
    nodes: InternalQuadtree<T>[];
    constructor(bounds: Range, maxObjects: number = 10) {
        this.bounds = bounds;
        this.maxObjects = maxObjects;
        this.level = 0;
        this.objects = new Set();
        this.nodes = [];
    }

    clear() {
        this.objects = new Set();
        for (let node of this.nodes) {
            node.clear();
        }
        this.nodes = [];
    }

    divide(objectList: ObjectList<T>) {
        const dims = this.bounds.dimensions;
        const halfWidth = dims[0] / 2;
        const halfHeight = dims[1] / 2;
        const centerX = this.bounds.pos1.x + halfWidth;
        const centerY = this.bounds.pos1.y + halfHeight;

        this.nodes[0] = new InternalQuadtree(
            new Range(
                { x: centerX, y: this.bounds.pos1.y },
                { x: this.bounds.pos2.x, y: centerY }
            ),
            this.maxObjects
        );
        this.nodes[1] = new InternalQuadtree(
            new Range(
                { x: this.bounds.pos1.x, y: this.bounds.pos1.y },
                { x: centerX, y: centerY }
            ),
            this.maxObjects
        );
        this.nodes[2] = new InternalQuadtree(
            new Range(
                { x: this.bounds.pos1.x, y: centerY },
                { x: centerX, y: this.bounds.pos2.y }
            ),
            this.maxObjects
        );
        this.nodes[3] = new InternalQuadtree(
            new Range(
                { x: centerX, y: centerY },
                { x: this.bounds.pos2.x, y: this.bounds.pos2.y }
            ),
            this.maxObjects
        );
        const objects = this.objects;
        this.objects = new Set();
        for (let objectID of objects) {
            this.insert(objectID, objectList);
        }
    }

    query(
        range: Range,
        objectList: ObjectList<T>,
        found?: Map<number, T>
    ): Map<number, T> {
        if (!found) {
            found = new Map();
        }
        if (!this.bounds.intersects(range)) {
            return found;
        } else {
            for (let objectID of this.objects) {
                let object = objectList.get(objectID);
                if (!object) {
                    continue;
                }
                if (this.bounds.contains(object.position)) {
                    if (range.contains(object.position)) {
                        found.set(object.id, object);
                    }
                } else {
                    this.objects.delete(objectID);
                }
            }

            for (let node of this.nodes) {
                node.query(range, objectList, found);
            }
            return found;
        }
    }

    insert(objectID: number, objectList: ObjectList<T>) {
        let object = objectList.get(objectID);
        if (!object) {
            return;
        }
        let objectPos = object.position;
        if (!this.bounds.contains(objectPos)) {
            return;
        }

        if (this.objects.size < this.maxObjects) {
            this.objects.add(objectID);
        } else {
            if (!this.nodes.length) {
                this.divide(objectList);
            }
            for (let node of this.nodes) {
                if (node.bounds.contains(objectPos)) {
                    node.insert(objectID, objectList);
                    break;
                }
            }
        }
    }

    rebuild(objects: ObjectList<T>) {
        this.clear();
        for (let objectID of objects.keys()) {
            this.insert(objectID, objects);
        }
    }
}
