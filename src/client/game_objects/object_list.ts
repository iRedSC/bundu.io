import { Entity } from "./entity";
import { Player } from "./player";
import { Structure } from "./structure";
import {
    IncomingEntityData,
    IncomingPlayerData,
    unpackEntityData,
    unpackPlayerData,
} from "./unpack";
import { WorldObject } from "./world_object";

export class GameObjectHolder {
    user?: Player;
    players: Map<number, Player>;
    entities: Map<number, Entity>;
    structures: Map<number, Structure>;
    worldObjects: Map<number, WorldObject>;

    constructor() {
        this.players = new Map();
        this.entities = new Map();
        this.structures = new Map();
        this.worldObjects = new Map();
    }

    tick() {
        for (let player of this.players.values()) {
            player.animationManager.update();
            player.move();
        }
        for (let entity of this.entities.values()) {
            entity.animationManager.update();
            entity.move();
        }
    }

    digest(incoming: IncomingEntityData | IncomingPlayerData) {
        switch (incoming[0]) {
            case 0:
                unpackPlayerData(incoming, this.players);
                break;
            case 1:
                unpackEntityData(incoming, this.entities);
                break;
        }
    }
}
