import { Resource } from "./game_objects/resource";
import { Player } from "./game_objects/player";
import { Entity } from "./game_objects/entity";

export class World {
    resources: Map<number, Resource>;
    players: Map<number, Player>;
    entities: Map<number, Entity>;

    constructor() {
        this.resources = new Map();
        this.entities = new Map();
        this.players = new Map();
    }

    tick() {
        for (let [id, entity] of this.entities.entries()) {
        }
    }
}
