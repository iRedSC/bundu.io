// testing file (to mimic a server)

import { Random } from "../lib/random";
import { Ground } from "./game_objects/ground";
import { WORLD_SIZE } from "./constants";
import { BunduClient } from "./client";
import {
    IncomingEntityData,
    IncomingStructureData,
} from "./game_objects/unpack";
import { OBJECT_TYPE } from "../shared/enums";

export function createStuff(client: BunduClient) {
    const sea = new Ground(
        [
            [0, 0],
            [WORLD_SIZE, WORLD_SIZE],
        ],
        0x16a0ca
    );
    client.viewport.addChild(sea);

    const forest = new Ground(
        [
            [5000, 5000],
            [WORLD_SIZE - 5000, WORLD_SIZE - 5000],
        ],
        0x1b6430
    );
    client.viewport.addChild(forest);

    const structures: IncomingStructureData = [OBJECT_TYPE.Structure, 0, []];
    for (let i = 0; i < 1000; i++) {
        structures[2].push([
            0,
            i,
            Random.integer(0, 3),
            Random.integer(5000, WORLD_SIZE - 5000),
            Random.integer(5000, WORLD_SIZE - 5000),
            Random.integer(0, Math.PI * 360),
            Random.integer(3, 5),
        ]);
    }
    client.objectHandler.unpack(structures, client.viewport);

    const entities: IncomingEntityData = [OBJECT_TYPE.Entity, 0, []];
    for (let i = 0; i < 1; i++) {
        entities[2].push([
            0,
            i,
            Random.integer(0, 3),
            Random.integer(5000, WORLD_SIZE - 5000),
            Random.integer(5000, WORLD_SIZE - 5000),
            Random.integer(0, Math.PI * 360),
        ]);
    }
    client.objectHandler.unpack(entities, client.viewport);
}
