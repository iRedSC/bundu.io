import { Resource } from "./game_objects/resource.js";
import { Player } from "./game_objects/player.js";
import { Entity } from "./game_objects/entity.js";
import { Quadtree } from "../lib/quadtree.js";
import { Range } from "../lib/range.js";

class UpdateList {
    entities: Entity[];

    constructor() {
        this.entities = [];
    }
}

export class World {
    nextId: number;
    mapBounds: Range;
    resources: Quadtree<Resource>;
    players: Quadtree<Player>;
    entities: Quadtree<Entity>;

    constructor() {
        this.nextId = 0;
        this.mapBounds = new Range({ x: 0, y: 0 }, { x: 20000, y: 20000 });
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

    tick(): UpdateList {
        const updateList = new UpdateList();
        for (let [id, entity] of this.entities.objects.entries()) {
            const moved = entity.move();
            if (moved) {
                updateList.entities.push(entity);
            }
        }
        return updateList;
    }
}
