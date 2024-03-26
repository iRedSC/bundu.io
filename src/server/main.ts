import Random from "../lib/random.js";
import { Entity } from "./game_objects/entity.js";
import { BunduServer } from "./server.js";
import { GameWS, ServerController } from "./websockets.js";
import { World } from "./world.js";
import {
    Schemas,
    PACKET_TYPE,
    CLIENT_PACKET_TYPE,
    ClientSchemas,
} from "../shared/enums.js";
import { PacketPipeline, Unpacker } from "../shared/unpack.js";
import { Resource } from "./game_objects/resource.js";
import { round } from "../lib/math.js";

const packetPipeline = new PacketPipeline();

const world = new World();
const bunduServer = new BunduServer(world, packetPipeline);
const controller = new ServerController(bunduServer);

packetPipeline.add(
    CLIENT_PACKET_TYPE.PING,
    new Unpacker(bunduServer.ping.bind(bunduServer), ClientSchemas.ping)
);

packetPipeline.add(
    CLIENT_PACKET_TYPE.MOVE_UPDATE,
    new Unpacker(
        bunduServer.moveUpdate.bind(bunduServer),
        ClientSchemas.moveUpdate
    )
);

packetPipeline.add(
    CLIENT_PACKET_TYPE.ROTATE,
    new Unpacker(
        bunduServer.rotatePlayer.bind(bunduServer),
        ClientSchemas.rotate
    )
);

packetPipeline.add(
    CLIENT_PACKET_TYPE.ACTION,
    new Unpacker(
        bunduServer.playerAction.bind(bunduServer),
        ClientSchemas.action
    )
);

bunduServer.start();
controller.start(7777);

const WORLD_SIZE = 20000;
for (let i = 5000; i < 5100; i++) {
    const structure = new Resource(
        i,
        [Random.integer(1500, 19500), Random.integer(1500, 19500)],
        Random.integer(0, Math.PI * 360),
        Random.integer(200, 205),
        Random.integer(7, 14)
    );

    world.resources.insert(structure);
}

for (let i = 1001; i < 1100; i++) {
    const pos: [number, number] = [
        Random.integer(1500, 19500),
        Random.integer(1500, 19500),
    ];
    const entity = new Entity(i, Random.integer(400, 402), pos, 0);
    world.entities.insert(entity);
}

const ground: [number, ...any[]] = [
    PACKET_TYPE.LOAD_GROUND,
    1500,
    1500,
    19500,
    19500,
    0,
    10000,
    10000,
    12000,
    12000,
    1,
];

controller.connect = (socket: GameWS) => {
    const entities = [PACKET_TYPE.NEW_ENTITY];
    for (let entity of world.entities.objects.values()) {
        entities.push(...entity.pack(PACKET_TYPE.NEW_ENTITY));
    }
    const structures = [PACKET_TYPE.NEW_STRUCTURE];
    for (let structure of world.resources.objects.values()) {
        structures.push(...structure.pack(PACKET_TYPE.NEW_STRUCTURE));
    }
    socket.send(JSON.stringify(ground));
    socket.send(JSON.stringify(structures));
    socket.send(JSON.stringify(entities));
};

setInterval(() => {
    console.log(
        `Memory Usage: ${round(process.memoryUsage().heapUsed * 0.000001, 2)}mb`
    );
}, 5000);
// const serverController = new ServerController(bunduServer);

// serverController.start(7777);
