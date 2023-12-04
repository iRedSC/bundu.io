import { Entity } from "./entity";
import { Player } from "./player";
import { Structure } from "./structure";
import {
    IncomingEntityData,
    IncomingPlayerData,
    IncomingStructureData,
    unpackEntityData,
    unpackPlayerData,
    unpackStructureData,
} from "./unpack";
import { WorldObject } from "./world_object";
import * as PIXI from "pixi.js";

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

    unpack(
        incoming:
            | IncomingEntityData
            | IncomingPlayerData
            | IncomingStructureData,
        container: PIXI.Container
    ) {
        switch (incoming[0]) {
            case 0:
                unpackPlayerData(incoming, this.players, container);
                break;
            case 1:
                unpackEntityData(incoming, this.entities, container);
                break;
            case 2:
                unpackStructureData(incoming, this.structures, container);
                break;
        }
    }
}
