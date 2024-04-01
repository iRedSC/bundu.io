import { GameWS, ServerController } from "./network/websockets.js";
import { World } from "./game_engine/world.js";
import {
    PACKET_TYPE,
    CLIENT_PACKET_TYPE,
    ClientPacketSchema,
} from "../shared/enums.js";
import { PacketPipeline, Unpacker } from "../shared/unpack.js";
import { round } from "../lib/math.js";
import { createEntities, createGround, createResources } from "./testing.js";
import Logger from "js-logger";
import { send } from "./send.js";
import { PlayerController } from "./player_controller.js";
import { createPacketPipeline } from "./network/packets.js";

Logger.useDefaults();

const playerController = new PlayerController();
const pipeline = createPacketPipeline(playerController);

const world = new World();
const controller = new ServerController();
controller.start(7777);

controller.connect = (socket: GameWS) => {};
controller.message = (socket: GameWS, message: unknown) => {
    pipeline.unpack(message, socket.id);
};

// * Check memory usage, could be put in a better spot.
setInterval(() => {
    Logger.get("Performance").info(
        `Memory Usage: ${round(process.memoryUsage().heapUsed * 0.000001, 2)}mb`
    );
}, 10000);
