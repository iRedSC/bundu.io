import {
    Serializer,
    ServerPacketReceiver,
    ServerController,
    serverTime,
} from "@ioengine/server";
import { loadConfigs } from "./configs/loaders/load";
import { World } from "../../ioengine/server/game_engine/world";
import { PlayerSystem } from "./systems/player";
import {
    ClientPacket,
    Schema,
    ServerPacket,
    type ClientPacketMap,
} from "@shared/packet_definitions";
import { setupPacketReceiving } from "./network/receiver";
import { PositionSystem } from "./systems/position";
import { CollisionSystem } from "./systems/collision";
import { HealthSystem } from "./systems/health";
import { random } from "@ioengine/lib";
import { Player } from "./game_objects/player";
import {
    playerPacketManager,
    socketManager,
    worldPacketManager,
} from "./network/managers";
import { PlayerData } from "./components/player";
import { Circle, Vector } from "sat";
import { PacketSystem } from "./systems/packet";
import { AttackSystem } from "./systems/attack";
import { encode } from "@msgpack/msgpack";
import { RenderDistanceSystem } from "./systems/render_distance";
import { GameEvent } from "./systems/event_map";

const world = new World();
loadConfigs();

const playerSystem = new PlayerSystem();
const serializer = new Serializer<typeof Schema.Client, ClientPacketMap>(
    Schema.Client
);
const receiver = new ServerPacketReceiver(serializer);
setupPacketReceiving(receiver, playerSystem);

world
    .addSystem(playerSystem)
    .addSystem(new PositionSystem())
    .addSystem(new CollisionSystem())
    .addSystem(new HealthSystem())
    .addSystem(new PacketSystem())
    .addSystem(new AttackSystem())
    .addSystem(new RenderDistanceSystem());

playerSystem.trigger(GameEvent.PlaceStructure, {
    structureId: 2,
    x: 7700,
    y: 7500,
    rotation: 0,
});

function createPlayer(username: string, skinId: number) {
    const position = new Vector(
        random.integer(7500, 7500),
        random.integer(7500, 7500)
    );
    const size = 10;
    const collider = new Circle(position, size);

    const player = new Player(
        { position, collider, size, solid: false, rotation: 0, speed: 10 },
        {
            name: username,
            score: 0,
            playerSkin: skinId,

            moveDir: [0, 0],
            selectedStructure: {
                id: -1,
                cooldown_timestamp: 0,
            },
        }
    );
    world.addObject(player);
    console.log("added player object");

    playerPacketManager.set(player.id, ServerPacket.ClientConnectionInfo, {
        playerId: player.id,
        serverStartTime: serverTime.start,
    });
    console.log("Added client info packet");

    return player.id;
}

const controller = new ServerController(socketManager, createPlayer);

controller.message = (socket, packet) => {
    if (packet[0] === ClientPacket.Ping) {
        socket.send(encode([serverTime.now(), [ServerPacket.Ping]]));
    }
    receiver.add(socket.data.playerId, packet);
};

const TICK_INTERVAL = 50;

async function startTicker() {
    while (true) {
        const start = performance.now();

        receiver.process();

        world.update();

        playerPacketManager.process(
            world.query([PlayerData]),
            socketManager,
            worldPacketManager
        );
        playerPacketManager.clear();
        worldPacketManager.clear();
        receiver.clear();

        const elapsed = performance.now() - start;
        await Bun.sleep(Math.max(0, TICK_INTERVAL - elapsed));
    }
}

controller.start(7777);
startTicker();
