import { ServerController } from "./engine";
import { createWorld } from "./bootstrap/create_world";
import { loadMap } from "./bootstrap/load_map";
import { createPlayer } from "./bootstrap/create_player";
import { startTicker } from "./bootstrap/start_ticker";
import { GameEvent } from "./systems/event_map";

const { world, playerSystem, receiver } = createWorld();
loadMap(world, playerSystem);

const { socketManager } = world.context;

const controller = new ServerController(socketManager, (username, skinId) =>
    createPlayer(world, username, skinId)
);

controller.disconnect = (socket) => {
    const playerId = socket.data.playerId;
    if (playerId < 0) return;
    socketManager.deleteClient(playerId);
    const player = world.getObject(playerId);
    if (!player?.active) return;
    player.active = false;
    playerSystem.trigger(GameEvent.DeleteObject, { object: player });
};

controller.message = (socket, packet) => {
    receiver.add(socket.data.playerId, packet);
};

const WS_PORT = Number(process.env.WS_PORT ?? 7777);
controller.start(WS_PORT);
startTicker(world, receiver);
