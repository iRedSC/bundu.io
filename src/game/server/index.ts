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
import { Box, Circle, Vector } from "sat";
import { PacketSystem } from "./systems/packet";
import { AttackSystem } from "./systems/attack";
import { encode } from "@msgpack/msgpack";
import { RenderDistanceSystem } from "./systems/render_distance";
import { GameEvent } from "./systems/event_map";
import { Ground } from "./game_objects/ground";
import { Resource } from "./game_objects/resource";
import { getNumericId } from "@shared/id_map";
import { StructureSystem } from "./systems/structure";

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
    .addSystem(new StructureSystem())
    .addSystem(new RenderDistanceSystem());

const TEST_MAP_SIZE = 20000;
const TEST_MAP_BORDER_PADDING = 300;
const TEST_MAP_RESOURCE_COUNT = 450;

const TEST_MAP_RESOURCE_IDS: string[] = [
    "forest_tree",
    "pine_tree",
    "pine_tree_snow",
    "savanah_tree",
    "stone",
    "gold",
    "diamond",
    "amethyst",
];

function getRequiredNumericId(id: string) {
    const numericId = getNumericId(id);
    if (typeof numericId !== "number") {
        throw new Error(`Missing numeric id for ${id}`);
    }
    return numericId;
}

function addResource(
    id: string,
    x: number,
    y: number,
    collisionRadius: number,
    rotation = 0
) {
    const position = new Vector(x, y);
    world.addObject(
        new Resource(
            {
                position,
                collider: new Circle(position, collisionRadius),
                rotation,
                collisionRadius,
                solid: true,
                speed: 0,
            },
            { id: getRequiredNumericId(id), variant: 0 }
        )
    );
}

function loadTestMap() {
    const origin = new Vector(0, 0);
    world.addObject(
        new Ground({
            collider: new Box(origin, TEST_MAP_SIZE, TEST_MAP_SIZE),
            type: 1,
            speedMultiplier: 1,
            createPacket() {
                return [1, 0, 0, TEST_MAP_SIZE, TEST_MAP_SIZE];
            },
        })
    );

    const borderSize = 56;
    const borderStep = borderSize * 2;
    for (let pos = 0; pos <= TEST_MAP_SIZE; pos += borderStep) {
        addResource("stone_barrier", pos, 0, borderSize);
        addResource("stone_barrier", pos, TEST_MAP_SIZE, borderSize);
        addResource("stone_barrier", 0, pos, borderSize);
        addResource("stone_barrier", TEST_MAP_SIZE, pos, borderSize);
    }

    for (let i = 0; i < TEST_MAP_RESOURCE_COUNT; i++) {
        const id = random.choice(TEST_MAP_RESOURCE_IDS);
        addResource(
            id,
            random.integer(
                TEST_MAP_BORDER_PADDING,
                TEST_MAP_SIZE - TEST_MAP_BORDER_PADDING
            ),
            random.integer(
                TEST_MAP_BORDER_PADDING,
                TEST_MAP_SIZE - TEST_MAP_BORDER_PADDING
            ),
            random.integer(30, 70),
            random.integer(0, 360)
        );
    }
}

loadTestMap();

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
    const collisionRadius = 30;
    const collider = new Circle(position, collisionRadius);

    const player = new Player(
        {
            position,
            collider,
            collisionRadius,
            solid: false,
            rotation: 0,
            speed: 10,
        },
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
