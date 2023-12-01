import { Entity } from "./game_objects/entity";
import { Player } from "./game_objects/player";
import { Structure } from "./game_objects/structure";
import { WorldObject } from "./game_objects/world_object";

type IncomingPlayerData =
    | [
          dataType: 0,
          id: number,
          name: string,
          x: number,
          y: number,
          rotation: number,
          selectedItem: number,
          helmet: number
      ][]
    | [dataType: 1, id: number, x: number, y: number, rotation: number][]
    | [dataType: 2, id: number, selectedItem: number, helmet: number][];

type IncomingData = [time: number, [dataType: 0, IncomingPlayerData][]];

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
            player.move();
        }
        for (let entity of this.entities.values()) {
            entity.move();
        }
    }

    digest(incoming: IncomingData) {
        const time = incoming[0];
        for (let packet of incoming[1]) {
            switch (packet[0]) {
                case 0:
                    for (let entry of packet[1]) {
                        switch (entry[0]) {
                            case 0:
                                this.players.set(
                                    entry[1],
                                    new Player(entry[1], [
                                        time,
                                        entry[3],
                                        entry[4],
                                        entry[5],
                                    ])
                                );
                        }
                    }
            }
        }
    }
}
