import { Resource } from "./game_objects/resource";
import { Player } from "./game_objects/player";
import { Entity } from "./game_objects/entity";
import { Quadtree } from "../lib/quadtree";
import { Range } from "../lib/range";

export class World {
    mapBounds: Range;
    resources: Quadtree<Resource>;
    players: Quadtree<Player>;
    entities: Quadtree<Entity>;

    constructor() {
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

    tick() {
        for (let [id, entity] of this.entities.objects.entries()) {
            entity.move();
        }
    }
}
