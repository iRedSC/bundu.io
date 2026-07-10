import { type BasicPoint } from "./types";
import { Range } from "./range";

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
        this.tree.delete(objectID);
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

    private canRecombine(): boolean {
        if (this.nodes.length === 0) return false;

        return this.nodes.every((node) => node.objects.size === 0);
    }

    private recombine() {
        if (!this.canRecombine()) return;

        for (let node of this.nodes) {
            node.clear();
        }
        this.nodes = [];
    }

    query(
        range: Range,
        objectList: QuadtreeObjectList,
        found?: number[]
    ): number[] {
        if (!found) {
            found = [];
        }
        if (!this.bounds.intersects(range)) {
            return found;
        } else {
            for (let id of this.objects.keys()) {
                const position = objectList.get(id);
                if (!position) continue;

                const isInNode = this.bounds.contains(position);
                const isInQuery = range.contains(position);
                if (!isInNode) {
                    this.objects.delete(id);
                    continue;
                }

                if (isInQuery) {
                    found.push(id);
                }
            }

            for (let node of this.nodes) {
                node.query(range, objectList, found);
            }

            this.recombine();

            return found;
        }
    }

    delete(objectID: number) {
        this.objects.delete(objectID);

        for (let node of this.nodes) {
            node.delete(objectID);
        }

        this.recombine();
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

export default Quadtree;
