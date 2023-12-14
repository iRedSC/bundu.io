// testing file (to mimic a server)

import { Random } from "../lib/random";
import { Ground } from "./game_objects/ground";
import { WORLD_SIZE } from "./constants";
import { PACKET, PACKET_TYPE } from "../shared/enums";
import { Unpacker } from "./game_objects/unpack";
import { World } from "./game_objects/object_list";

export function createStuff(world: World, unpacker: Unpacker) {
    const sea = new Ground(
        [
            [0, 0],
            [WORLD_SIZE, WORLD_SIZE],
        ],
        0x16a0ca
    );
    world.viewport.addChild(sea);

    const forest = new Ground(
        [
            [5000, 5000],
            [WORLD_SIZE - 5000, WORLD_SIZE - 5000],
        ],
        0x1b6430
    );
    world.viewport.addChild(forest);

    const structures: PACKET.FULL.NEW_STRUCTURE = [
        PACKET_TYPE.NEW_STRUCTURE,
        0,
        [],
    ];
    for (let i = 0; i < 1000; i++) {
        structures[2].push([
            i,
            Random.integer(0, 3),
            Random.integer(5000, WORLD_SIZE - 5000),
            Random.integer(5000, WORLD_SIZE - 5000),
            Random.integer(0, Math.PI * 360),
            Random.integer(3, 5),
        ]);
    }
    unpacker.unpack(structures);

    // const entities: PACKE = [OBJECT_TYPE.Entity, 0, []];
    // for (let i = 0; i < 1; i++) {
    //     entities[2].push([
    //         0,
    //         i,
    //         Random.integer(0, 3),
    //         Random.integer(5000, WORLD_SIZE - 5000),
    //         Random.integer(5000, WORLD_SIZE - 5000),
    //         Random.integer(0, Math.PI * 360),
    //     ]);
    // }
    // client.objectHandler.unpack(entities, client.viewport);
}
