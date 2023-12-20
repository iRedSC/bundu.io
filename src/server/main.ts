import Random from "../lib/random.js";
import { Entity } from "./game_objects/entity.js";
import { BunduServer } from "./server.js";
import { GameWS, ServerController } from "./websockets.js";
import { World } from "./world.js";
import { PACKET, PACKET_TYPE } from "../shared/enums.js";

const world = new World();
const bunduServer = new BunduServer(world);
const controller = new ServerController(bunduServer);

bunduServer.start();
controller.start(7777);

const WORLD_SIZE = 200000;
const structures: [number, number, number[][]] = [
    PACKET_TYPE.NEW_STRUCTURE,
    0,
    [],
];
for (let i = 0; i < 1000; i++) {
    structures[2].push([
        i,
        Random.integer(200, 205),
        Random.integer(5000, WORLD_SIZE - 5000),
        Random.integer(5000, WORLD_SIZE - 5000),
        Random.integer(0, Math.PI * 360),
        Random.integer(3, 5),
    ]);
}

const entities: [number, number, number[][]] = [
    PACKET_TYPE.NEW_STRUCTURE,
    0,
    [],
];
for (let i = 1001; i < 2000; i++) {
    const pos: [number, number] = [
        Random.integer(5000, WORLD_SIZE - 5000),
        Random.integer(5000, WORLD_SIZE - 5000),
    ];
    const entity = new Entity(i, Random.integer(400, 402), pos, 0);
    world.entities.insert(entity);
    entities[2].push(entity.packNew() as PACKET.NEW_STRUCTURE);
}

controller.connect = (socket: GameWS) => {
    socket.send(JSON.stringify(structures));
    socket.send(JSON.stringify(entities));
};
// const serverController = new ServerController(bunduServer);

// serverController.start(7777);
