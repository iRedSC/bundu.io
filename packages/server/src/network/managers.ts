import {
    ServerSchema,
    type ServerPacketMap,
} from "@bundu/shared/packet_definitions";
import { WORLD_BOUNDS } from "@bundu/shared/tiles";
import { Serializer } from "@bundu/shared";
import {
    WorldPacketManager,
    PlayerPacketManager,
    SocketManager,
    type ServerContext,
} from "../engine";
import { Quadtree } from "../engine/quadtree.js";
import { OccupancyGrid } from "../engine/occupancy.js";
import { VisibleObjects } from "../components/visible_objects";
import { DayCycle } from "./day_cycle.js";

export type { ServerContext };

/** Build a fresh context for one World (no process-wide singletons). */
export function createServerContext(): ServerContext {
    const serializer = new Serializer<ServerPacketMap>(ServerSchema);
    const worldPacketManager = new WorldPacketManager(serializer);
    const playerPacketManager = new PlayerPacketManager(serializer);

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
        dayCycle: new DayCycle(),
    };
}
