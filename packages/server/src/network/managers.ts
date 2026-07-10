import { Schema, type ServerPacketMap } from "@bundu/shared/packet_definitions";
import {
    WorldPacketManager,
    PlayerPacketManager,
    SocketManager,
    type ServerContext,
} from "../engine";
import { Quadtree } from "../engine/quadtree.js";
import { VisibleObjects } from "../components/visible_objects";

export type { ServerContext };

/** Build a fresh context for one World (no process-wide singletons). */
export function createServerContext(): ServerContext {
    const worldPacketManager = new WorldPacketManager<
        typeof Schema.Server,
        ServerPacketMap
    >(Schema.Server);

    const playerPacketManager = new PlayerPacketManager<
        typeof Schema.Server,
        ServerPacketMap
    >(Schema.Server);

    playerPacketManager.visibleObjectsCallback = (player) => {
        return player.get(VisibleObjects).visible.values();
    };

    return {
        // Bounds match WORLD_BOUNDS in position.ts (avoid import cycle).
        quadtree: new Quadtree(
            new Map(),
            [
                { x: 0, y: 0 },
                { x: 20000, y: 20000 },
            ],
            5
        ),
        worldPacketManager,
        playerPacketManager,
        socketManager: new SocketManager(),
    };
}
