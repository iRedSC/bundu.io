import { Random } from "../lib/random";
import { loadGround } from "./game_objects/ground";
import { WORLD_SIZE } from "./constants";
import { BunduClient } from "./client";
import {
    IncomingEntityData,
    IncomingStructureData,
} from "./game_objects/unpack";

export function createStuff(client: BunduClient) {
    loadGround(
        client.viewport,
        [
            [0, 0],
            [WORLD_SIZE, WORLD_SIZE],
        ],
        0x16a0ca
    );

    loadGround(
        client.viewport,
        [
            [5000, 5000],
            [WORLD_SIZE - 5000, WORLD_SIZE - 5000],
        ],
        0x1b6430
    );

    const structures: IncomingStructureData = [2, 0, []];
    for (let i = 0; i < 10000; i++) {
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

    const entities: IncomingEntityData = [1, 0, []];
    for (let i = 0; i < 10000; i++) {
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
