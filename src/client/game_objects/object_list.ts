import { AnimationManager } from "../../lib/animation";
import { OBJECT_TYPE } from "../../shared/enums";
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
    animationManager: AnimationManager;
    user?: Player;
    players: Map<number, Player>;
    entities: Map<number, Entity>;
    structures: Map<number, Structure>;
    worldObjects: Map<number, WorldObject>;

    constructor(animationManager: AnimationManager) {
        this.animationManager = animationManager;
        this.players = new Map();
        this.entities = new Map();
        this.structures = new Map();
        this.worldObjects = new Map();
    }

    tick() {
        this.animationManager.update();
        for (let entity of this.entities.values()) {
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
            case OBJECT_TYPE.Player:
                unpackPlayerData(
                    incoming,
                    this.players,
                    container,
                    this.animationManager
                );
                break;
            case OBJECT_TYPE.Entity:
                unpackEntityData(
                    incoming,
                    this.entities,
                    container,
                    this.animationManager
                );
                break;
            case OBJECT_TYPE.Structure:
                unpackStructureData(incoming, this.structures, container);
                break;
        }
    }
}
