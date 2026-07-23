import { Range, type BasicPoint } from "@bundu/shared";

export type QuadtreeObjectList = Map<number, BasicPoint>;

const DEFAULT_MAX_OBJECTS = 10;
const DEFAULT_MAX_DEPTH = 8;

type StoredPoint = { x: number; y: number };

export class Quadtree {
    tree: InternalQuadtree;
    objects: QuadtreeObjectList;
    /**
     * Last coordinates used to place each id in the tree. Needed because
     * callers often mutate `Physics.position` in place before re-inserting.
     */
    private readonly locations = new Map<number, StoredPoint>();

    constructor(
        objectList: QuadtreeObjectList,
        bounds: [BasicPoint, BasicPoint],
        maxObjects: number = DEFAULT_MAX_OBJECTS,
        maxDepth: number = DEFAULT_MAX_DEPTH
    ) {
        this.objects = objectList;
        this.tree = new InternalQuadtree(
            new Range(bounds[0], bounds[1]),
            maxObjects,
            maxDepth,
            0
        );
    }

    delete(objectID: number) {
        const location = this.locations.get(objectID);
        this.objects.delete(objectID);
        this.locations.delete(objectID);
        if (!location) return;
        if (!this.tree.delete(objectID, location)) {
            this.tree.deleteScan(objectID);
        }
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
        this.locations.clear();
    }

    insert(objectId: number, position: BasicPoint) {
        const previous = this.locations.get(objectId);
        if (previous) {
            if (!this.tree.delete(objectId, previous)) {
                this.tree.deleteScan(objectId);
            }
        }
        this.objects.set(objectId, position);
        this.locations.set(objectId, { x: position.x, y: position.y });
        this.tree.insert(objectId, this.objects);
    }

    query(bounds: [BasicPoint, BasicPoint]) {
        return this.tree.query(new Range(bounds[0], bounds[1]), this.objects);
    }

    rebuild() {
        this.tree.clear();
        this.locations.clear();
        for (const [id, position] of this.objects) {
            this.locations.set(id, { x: position.x, y: position.y });
            this.tree.insert(id, this.objects);
        }
    }

    /** Replace root bounds and reinsert every tracked object. */
    resizeBounds(bounds: [BasicPoint, BasicPoint]) {
        const { maxObjects, maxDepth } = this.tree;
        this.tree = new InternalQuadtree(
            new Range(bounds[0], bounds[1]),
            maxObjects,
            maxDepth,
            0
        );
        this.rebuild();
    }
}

/**
 * Point quadtree: objects live only in leaves, splits empty the parent,
 * depth is capped, and deletes walk by position (with a scan fallback).
 */
class InternalQuadtree {
    bounds: Range;
    maxObjects: number;
    maxDepth: number;
    depth: number;
    /** Ids stored only while this node is a leaf. */
    objects: Set<number>;
    nodes: InternalQuadtree[];

    constructor(
        bounds: Range,
        maxObjects: number,
        maxDepth: number,
        depth: number
    ) {
        this.bounds = bounds;
        this.maxObjects = maxObjects;
        this.maxDepth = maxDepth;
        this.depth = depth;
        this.objects = new Set();
        this.nodes = [];
    }

    clear() {
        this.objects.clear();
        this.nodes = [];
    }

    private isLeaf(): boolean {
        return this.nodes.length === 0;
    }

    /**
     * Pick a child without relying on overlapping inclusive ranges, so points
     * on shared edges always land in the same quadrant on insert and delete.
     */
    private childIndex(position: BasicPoint): number {
        const [min, max] = this.bounds.normalized;
        const cx = min.x + (max.x - min.x) / 2;
        const cy = min.y + (max.y - min.y) / 2;
        const right = position.x >= cx;
        const bottom = position.y >= cy;
        // 0 right-top, 1 left-top, 2 left-bottom, 3 right-bottom
        if (!bottom && right) return 0;
        if (!bottom && !right) return 1;
        if (bottom && !right) return 2;
        return 3;
    }

    private child(position: BasicPoint): InternalQuadtree {
        const node = this.nodes[this.childIndex(position)];
        if (!node) {
            throw new Error("quadtree child missing");
        }
        return node;
    }

    private divide(objectList: QuadtreeObjectList) {
        const [min, max] = this.bounds.normalized;
        const cx = min.x + (max.x - min.x) / 2;
        const cy = min.y + (max.y - min.y) / 2;
        const nextDepth = this.depth + 1;

        this.nodes = [
            new InternalQuadtree(
                new Range({ x: cx, y: min.y }, { x: max.x, y: cy }),
                this.maxObjects,
                this.maxDepth,
                nextDepth
            ),
            new InternalQuadtree(
                new Range({ x: min.x, y: min.y }, { x: cx, y: cy }),
                this.maxObjects,
                this.maxDepth,
                nextDepth
            ),
            new InternalQuadtree(
                new Range({ x: min.x, y: cy }, { x: cx, y: max.y }),
                this.maxObjects,
                this.maxDepth,
                nextDepth
            ),
            new InternalQuadtree(
                new Range({ x: cx, y: cy }, { x: max.x, y: max.y }),
                this.maxObjects,
                this.maxDepth,
                nextDepth
            ),
        ];

        const ids = this.objects;
        this.objects = new Set();
        for (const id of ids) {
            this.insert(id, objectList);
        }
    }

    /** Collapse children when all are leaves and total count fits again. */
    private tryRecombine() {
        if (this.isLeaf()) return;
        if (this.nodes.some((node) => !node.isLeaf())) return;

        let total = 0;
        for (const node of this.nodes) {
            total += node.objects.size;
            if (total > this.maxObjects) return;
        }

        const merged = new Set<number>();
        for (const node of this.nodes) {
            for (const id of node.objects) {
                merged.add(id);
            }
        }
        this.objects = merged;
        this.nodes = [];
    }

    query(
        range: Range,
        objectList: QuadtreeObjectList,
        found: number[] = []
    ): number[] {
        if (!this.bounds.intersects(range)) {
            return found;
        }

        if (this.isLeaf()) {
            for (const id of this.objects) {
                const position = objectList.get(id);
                if (position && range.contains(position)) {
                    found.push(id);
                }
            }
            return found;
        }

        for (const node of this.nodes) {
            node.query(range, objectList, found);
        }
        return found;
    }

    delete(objectID: number, position: BasicPoint): boolean {
        if (!this.isLeaf()) {
            const deleted = this.child(position).delete(objectID, position);
            if (deleted) {
                this.tryRecombine();
            }
            return deleted;
        }
        return this.objects.delete(objectID);
    }

    /** Slow path if position routing misses (corruption / out-of-bounds). */
    deleteScan(objectID: number): boolean {
        if (this.isLeaf()) {
            return this.objects.delete(objectID);
        }

        let deleted = false;
        for (const node of this.nodes) {
            if (node.deleteScan(objectID)) {
                deleted = true;
                break;
            }
        }
        if (deleted) {
            this.tryRecombine();
        }
        return deleted;
    }

    insert(id: number, objectList: QuadtreeObjectList): boolean {
        const position = objectList.get(id);
        if (!position) {
            console.error(`CANNOT ADD OBJECT ${id} TO TREE`);
            return false;
        }
        if (!this.bounds.contains(position)) {
            return false;
        }

        if (!this.isLeaf()) {
            return this.child(position).insert(id, objectList);
        }

        this.objects.add(id);
        if (this.objects.size > this.maxObjects && this.depth < this.maxDepth) {
            this.divide(objectList);
        }
        return true;
    }
}

export default Quadtree;
