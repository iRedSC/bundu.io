import { Resource } from "./game_objects/resource.js";
import { Player } from "./game_objects/player.js";
import { Entity } from "./game_objects/entity.js";
import { Quadtree } from "../lib/quadtree.js";
import { Range } from "../lib/range.js";
import SAT from "sat";
import { WorldObject } from "./game_objects/base.js";

type UpdateList = {
    entities: Map<number, Entity>;
    players: Map<number, Player>;
};

export class World {
    nextId: number;
    mapBounds: Range;
    resources: Quadtree<Resource>;
    players: Quadtree<Player>;
    entities: Quadtree<Entity>;

    constructor() {
        this.nextId = 0;
        this.mapBounds = new Range({ x: 0, y: 0 }, { x: 200000, y: 200000 });
        this.resources = new Quadtree(
            new Map<number, Resource>(),
            this.mapBounds,
            10
        );
        this.entities = new Quadtree(
            new Map<number, Entity>(),
            this.mapBounds,
            10
        );
        this.players = new Quadtree(
            new Map<number, Player>(),
            this.mapBounds,
            10
        );
    }

    tick(updateList: UpdateList) {
        for (let [id, entity] of this.entities.objects.entries()) {
            const detectionRange = collisionBounds(entity.position);
            const collisionTest = this.resources.query(detectionRange);
            const moved = entity.move(collisionTest.values());
            if (moved) {
                updateList.entities.set(id, entity);
            }
        }
        for (let [id, player] of this.players.objects.entries()) {
            const moved = player.move();
            collideCircle(player, player.collider.pos, this);
            if (moved) {
                updateList.players.set(id, player);
            }
        }
    }
}

function collisionBounds(pos: { x: number; y: number; [key: string]: any }) {
    const dist = 5000;
    const p1 = { x: pos.x - dist, y: pos.y - dist };
    const p2 = { x: pos.x + dist, y: pos.y + dist };
    return new Range(p1, p2);
}

function collisionObjects(bounds: Range) {}

function collideCircle(
    object: WorldObject,
    updateVec: SAT.Vector,
    world: World
) {
    const detectionRange = collisionBounds(object.position);
    const collisionTest = world.resources.query(detectionRange);
    for (const other of collisionTest.values()) {
        const response = new SAT.Response();
        const overlap = SAT.testCircleCircle(
            object.collider,
            other.collider,
            response
        );
        if (overlap) {
            updateVec.sub(response.overlapV);
        }
    }
}
