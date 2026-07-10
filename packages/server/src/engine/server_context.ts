import type { Schema, ServerPacketMap } from "@bundu/shared/packet_definitions.js";
import type { Quadtree } from "./quadtree.js";
import type { PlayerPacketManager } from "./network/packets/manager.js";
import type { WorldPacketManager } from "./network/packets/world.js";
import type { SocketManager } from "./network/socket_manager.js";

/** Per-world spatial index + net managers (not process-wide singletons). */
export type ServerContext = {
    readonly quadtree: Quadtree;
    readonly worldPacketManager: WorldPacketManager<
        typeof Schema.Server,
        ServerPacketMap
    >;
    readonly playerPacketManager: PlayerPacketManager<
        typeof Schema.Server,
        ServerPacketMap
    >;
    readonly socketManager: SocketManager;
};
