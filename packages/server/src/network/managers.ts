import { Schema, type ServerPacketMap } from "@bundu/shared/packet_definitions";
import { WORLD_BOUNDS } from "@bundu/shared/tiles";
import {
    WorldPacketManager,
    PlayerPacketManager,
    SocketManager,
    type ServerContext,
} from "../engine";
import { Quadtree } from "../engine/quadtree.js";
import { OccupancyGrid } from "../engine/occupancy.js";
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
        quadtree: new Quadtree(
            new Map(),
            [
                { x: 0, y: 0 },
                { x: WORLD_BOUNDS, y: WORLD_BOUNDS },
            ],
            5
        ),
        occupancy: new OccupancyGrid(),
        worldPacketManager,
        playerPacketManager,
        socketManager: new SocketManager(),
    };
}
