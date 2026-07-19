import { ServerController } from "./engine";
import { createWorld } from "./bootstrap/create_world";
import { loadMap } from "./bootstrap/load_map";
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
    loadMap(world, playerSystem);
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

const packHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
};

controller.requiredPackFingerprint = resourcePacks.manifest.fingerprint;
controller.http = (request, url) => {
    // Proxies may keep a mount prefix (e.g. /server/na/packs/...).
    const packsOffset = url.pathname.indexOf("/packs/");
    if (packsOffset < 0) return;
    const packPath = url.pathname.slice(packsOffset);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: packHeaders });
    }
    if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
            status: 405,
            headers: packHeaders,
        });
    }
    if (packPath === "/packs/manifest.json") {
        return Response.json(resourcePacks.manifest, {
            headers: { ...packHeaders, "Cache-Control": "no-store" },
        });
    }
    if (packPath === "/packs/models.json") {
        if (url.searchParams.get("hash") !== resourcePacks.manifest.models.hash) {
            return new Response("Not Found", { status: 404, headers: packHeaders });
        }
        return new Response(resourcePacks.modelsJson, {
            headers: {
                ...packHeaders,
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    }
    if (packPath === "/packs/registries.json") {
        if (
            url.searchParams.get("hash") !==
            resourcePacks.manifest.registries.hash
        ) {
            return new Response("Not Found", { status: 404, headers: packHeaders });
        }
        return new Response(resourcePacks.registriesJson, {
            headers: {
                ...packHeaders,
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    }
    if (packPath === "/packs/gameplay.json") {
        if (
            url.searchParams.get("hash") !== resourcePacks.manifest.gameplay.hash
        ) {
            return new Response("Not Found", { status: 404, headers: packHeaders });
        }
        return new Response(resourcePacks.gameplayJson, {
            headers: {
                ...packHeaders,
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    }
    if (packPath === "/packs/stat_bars.json") {
        if (
            url.searchParams.get("hash") !== resourcePacks.manifest.statBars.hash
        ) {
            return new Response("Not Found", { status: 404, headers: packHeaders });
        }
        return new Response(resourcePacks.statBarsJson, {
            headers: {
                ...packHeaders,
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    }
    const prefix = "/packs/assets/";
    if (!packPath.startsWith(prefix)) {
        return new Response("Not Found", { status: 404, headers: packHeaders });
    }
    const asset = resourcePacks.asset(packPath.slice(prefix.length));
    if (!asset || url.searchParams.get("hash") !== asset.hash) {
        return new Response("Not Found", { status: 404, headers: packHeaders });
    }
    return new Response(Buffer.from(asset.bytes), {
        headers: {
            ...packHeaders,
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
};

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
