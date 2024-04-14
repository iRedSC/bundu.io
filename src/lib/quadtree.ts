import { BasicPoint } from "./types.js";

export class Range {
    pos1: BasicPoint;
    pos2: BasicPoint;
    constructor(pos1: BasicPoint, pos2: BasicPoint) {
        this.pos1 = pos1;
        this.pos2 = pos2;
    }

    get dimensions(): [number, number] {
        const width = Math.abs(this.pos1.x - this.pos2.x);
        const height = Math.abs(this.pos1.y - this.pos2.y);

        return [width, height];
    }

    get normalized(): [BasicPoint, BasicPoint] {
        return [
            {
                x: Math.min(this.pos1.x, this.pos2.x),
                y: Math.min(this.pos1.y, this.pos2.y),
            },
            {
                x: Math.max(this.pos1.x, this.pos2.x),
                y: Math.max(this.pos1.y, this.pos2.y),
            },
        ];
    }

    contains(pos: BasicPoint): boolean {
        const normalized = this.normalized;
        const pos1 = normalized[0];
        const pos2 = normalized[1];
        const isInsideX = pos.x >= pos1.x && pos.x <= pos2.x;
        const isInsideY = pos.y >= pos1.y && pos.y <= pos2.y;

        return isInsideX && isInsideY;
    }

    intersects(range: Range): boolean {
        const normalized = this.normalized;
        const pos1 = normalized[0];
        const pos2 = normalized[1];
        const noOverlapX = pos2.x < range.pos1.x || pos1.x > range.pos2.x;
        const noOverlapY = pos2.y < range.pos1.y || pos1.y > range.pos2.y;

        return !(noOverlapX || noOverlapY);
    }
}

export type QuadtreeObjectList = Map<number, BasicPoint>;

export class Quadtree {
    tree: InternalQuadtree;
    objects: QuadtreeObjectList;
    constructor(
        objectList: QuadtreeObjectList,
        bounds: [BasicPoint, BasicPoint],
        maxObjects: number
    ) {
        const range = new Range(bounds[0], bounds[1]);
        this.tree = new InternalQuadtree(range, maxObjects);
        this.objects = objectList;
    }

    delete(objectID: number) {
        this.objects.delete(objectID);
    }

    get(objectID: number | undefined) {
        if (objectID !== undefined) {
            return this.objects.get(objectID);
        }
    }

    values() {
        return this.objects.values();
    }

    clear() {
        this.tree.clear();
    }

    insert(objectId: number, position: BasicPoint) {
        this.objects.set(objectId, position);
        this.tree.insert(objectId, this.objects);
    }

    query(bounds: [BasicPoint, BasicPoint]) {
        const range = new Range(bounds[0], bounds[1]);
        return this.tree.query(range, this.objects);
    }

    rebuild() {
        this.tree.rebuild(this.objects);
    }
}

class InternalQuadtree {
    bounds: Range;
    maxObjects: number;
    level: number;
    objects: Map<number, BasicPoint>;
    nodes: InternalQuadtree[];
    constructor(bounds: Range, maxObjects: number = 10) {
        this.bounds = bounds;
        this.maxObjects = maxObjects;
        this.level = 0;
        this.objects = new Map();
        this.nodes = [];
    }

    clear() {
        this.objects.clear();
        for (let node of this.nodes) {
            node.clear();
        }
        this.nodes = [];
    }

    divide(objectList: QuadtreeObjectList) {
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
        this.objects = new Map();
        for (let id of objects.keys()) {
            this.insert(id, objectList);
        }
    }

    query(
        range: Range,
        objectList: QuadtreeObjectList,
        found?: Set<number>
    ): Set<number> {
        if (!found) {
            found = new Set();
        }
        if (!this.bounds.intersects(range)) {
            return found;
        } else {
            for (let id of this.objects.keys()) {
                const position = objectList.get(id);
                if (!position) {
                    continue;
                }
                if (this.bounds.contains(position)) {
                    if (range.contains(position)) {
                        found.add(id);
                    }
                } else {
                    this.objects.delete(id);
                }
            }

            for (let node of this.nodes) {
                node.query(range, objectList, found);
            }
            return found;
        }
    }

    insert(id: number, objectList: QuadtreeObjectList): boolean {
        const position = objectList.get(id);
        if (!position) {
            console.error("CANNOT ADD OBJECT " + id + " TO TREE");
            return false;
        }
        if (!this.bounds.contains(position)) {
            return false;
        }

        if (this.objects.size < this.maxObjects) {
            this.objects.set(id, position);
            return true;
        } else {
            if (!this.nodes.length) {
                this.divide(objectList);
            }
            for (let node of this.nodes) {
                if (node.bounds.contains(position)) {
                    if (node.insert(id, objectList)) {
                        return true;
                    }
                }
            }
            return false;
        }
    }

    rebuild(objects: QuadtreeObjectList) {
        this.clear();
        for (let id of objects.keys()) {
            this.insert(id, objects);
        }
    }
}
