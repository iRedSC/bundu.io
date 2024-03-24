import Random from "../lib/random.js";
import { Entity } from "./game_objects/entity.js";
import { BunduServer } from "./server.js";
import { GameWS, ServerController } from "./websockets.js";
import { World } from "./world.js";
import { Schemas, PACKET_TYPE } from "../shared/enums.js";

const world = new World();
const bunduServer = new BunduServer(world);
const controller = new ServerController(bunduServer);

bunduServer.start();
controller.start(7777);

const WORLD_SIZE = 200000;
const structures: [number, ...any[]] = [PACKET_TYPE.NEW_STRUCTURE];
for (let i = 0; i < 1000; i++) {
    structures.push(
        i,
        Random.integer(5000, WORLD_SIZE - 5000),
        Random.integer(5000, WORLD_SIZE - 5000),
        Random.integer(0, Math.PI * 360),
        Random.integer(200, 205),
        Random.integer(3, 5)
    );
}

const entities: [number, ...any[]] = [PACKET_TYPE.NEW_ENTITY];
for (let i = 1001; i < 1100; i++) {
    const pos: [number, number] = [
        Random.integer(5000, WORLD_SIZE - 5000),
        Random.integer(5000, WORLD_SIZE - 5000),
    ];
    const entity = new Entity(i, Random.integer(400, 402), pos, 0);
    world.entities.insert(entity);
    entities.push(...entity.packNew());
}

const ground: [number, ...any[]] = [
    PACKET_TYPE.LOAD_GROUND,
    15000,
    15000,
    5000,
    5000,
    0,
    10000,
    10000,
    12000,
    12000,
    1,
];

controller.connect = (socket: GameWS) => {
    socket.send(JSON.stringify(ground));
    // socket.send(JSON.stringify(structures));
    // socket.send(JSON.stringify(entities));
};
// const serverController = new ServerController(bunduServer);

// serverController.start(7777);
