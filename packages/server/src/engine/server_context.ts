import type { PlayerPacketManager } from "./network/packets/manager.js";
import type { WorldPacketManager } from "./network/packets/world.js";
import type { SocketManager } from "./network/socket_manager.js";
import type { Quadtree } from "./quadtree.js";
import type { OccupancyGrid } from "./occupancy.js";
import type { DayCycle } from "../network/day_cycle.js";

/** Close after the tick flush so the dying client still gets final packets. */
export type PendingSessionEnd = {
    readonly playerId: number;
};

/** Per-world spatial index + net managers (not process-wide singletons). */
export type ServerContext = {
    readonly quadtree: Quadtree;
    readonly occupancy: OccupancyGrid;
    readonly worldPacketManager: WorldPacketManager;
    readonly playerPacketManager: PlayerPacketManager;
    readonly socketManager: SocketManager;
    readonly dayCycle: DayCycle;
    /** Player ids to hard-close after this tick's outbound flush. */
    readonly pendingSessionEnds: PendingSessionEnd[];
};
