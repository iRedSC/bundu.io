import { Entity } from "./game_objects/entity";
import { Player } from "./game_objects/player";
import { Structure } from "./game_objects/structure";
import { WorldObject } from "./game_objects/world_object";

export class GameWorld {
    entities: Entity[];
    structures: Structure[];
    players: Player[];
    worldObjects: WorldObject[];

    constructor() {
        this.entities = [];
        this.structures = [];
        this.players = [];
        this.worldObjects = [];
    }
}
