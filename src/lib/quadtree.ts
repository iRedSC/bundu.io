import { Range } from "./range.js";

type Point = [number, number];

type ObjectWithPos = {
    id: number;
    pos: Point;
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

    get(objectID: number) {
        return this.objects.get(objectID);
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
        const centerX = this.bounds.pos1[0] + halfWidth;
        const centerY = this.bounds.pos1[1] + halfHeight;

        this.nodes[0] = new InternalQuadtree(
            new Range(
                [centerX, this.bounds.pos1[1]],
                [this.bounds.pos2[0], centerY]
            ),
            this.maxObjects
        );
        this.nodes[1] = new InternalQuadtree(
            new Range(
                [this.bounds.pos1[0], this.bounds.pos1[1]],
                [centerX, centerY]
            ),
            this.maxObjects
        );
        this.nodes[2] = new InternalQuadtree(
            new Range(
                [this.bounds.pos1[0], centerY],
                [centerX, this.bounds.pos2[1]]
            ),
            this.maxObjects
        );
        this.nodes[3] = new InternalQuadtree(
            new Range(
                [centerX, centerY],
                [this.bounds.pos2[0], this.bounds.pos2[1]]
            ),
            this.maxObjects
        );
        const objects = this.objects;
        this.objects = new Set();
        for (let objectID of objects) {
            this.insert(objectID, objectList);
        }
    }

    query(range: Range, objectList: ObjectList<T>, found?: T[]): T[] {
        if (!found) {
            found = [];
        }
        if (!this.bounds.intersects(range)) {
            return found;
        } else {
            for (let objectID of this.objects) {
                let object = objectList.get(objectID);
                if (!object) {
                    continue;
                }
                if (this.bounds.contains(object.pos)) {
                    if (range.contains(object.pos)) {
                        found.push(object);
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
        let objectPos = object.pos;
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
