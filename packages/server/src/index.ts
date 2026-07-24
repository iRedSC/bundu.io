import { ServerController } from "./engine";
import { createWorld } from "./bootstrap/create_world";
import { loadMap } from "./bootstrap/load_map";
import { placeAnimals } from "./bootstrap/place_animals";
import { createPlayer } from "./bootstrap/create_player";
import { startTicker } from "./bootstrap/start_ticker";
import { ResourcePackService } from "./configs/resource_packs";
import {
    restoreDevCheckpoint,
    saveDevCheckpoint,
} from "./bootstrap/dev_checkpoint";

const { world, playerSystem, receiver } = createWorld();
const resourcePacks = await ResourcePackService.create();
const DEBUG = process.env.BUNDU_DEBUG === "1";
if (
    !DEBUG ||
    !restoreDevCheckpoint(world, resourcePacks.manifest.registries.hash)
) {
    loadMap(world);
    placeAnimals(world);
}

const { socketManager } = world.context;

const controller = new ServerController(socketManager, (username, skinId, sessionId) =>
    createPlayer(world, username, skinId, sessionId)
);

controller.connect = (socket) => {
    const player = world.getObject(socket.data.playerId);
    if (!player?.active) return;
    // Ground / HUD sync only — loadView waits for ClientReady.
    playerSystem.syncSession(player);
};

controller.requiredPackFingerprint = resourcePacks.manifest.fingerprint;
controller.http = (request, url) => resourcePacks.respond(request, url);

/** Soft-disconnect: detach socket only — player stays alive for reclaim. */
controller.disconnect = (socket) => {
    const playerId = socket.data.playerId;
    if (playerId < 0) return;
    socketManager.deleteClient(playerId);
    const player = world.getObject(playerId);
    if (!player?.active) return;
    playerSystem.parkDisconnected(player);
};

controller.message = (socket, packet) => {
    receiver.add(socket.data.playerId, packet);
};

const WS_PORT = Number(process.env.WS_PORT ?? 7777);
controller.start(WS_PORT);
startTicker(world, receiver);

if (DEBUG) {
    let checkpointing = false;
    process.on("SIGTERM", () => {
        if (checkpointing) return;
        checkpointing = true;
        try {
            saveDevCheckpoint(
                world,
                resourcePacks.manifest.registries.hash
            );
            process.exit(0);
        } catch (error) {
            console.error("[dev] checkpoint failed", error);
            process.exit(1);
        }
    });
}
