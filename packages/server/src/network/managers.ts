import { Schema, type ServerPacketMap } from "@bundu/shared/packet_definitions";
import {
    WorldPacketManager,
    PlayerPacketManager,
    SocketManager,
} from "../engine";
import { PlayerData } from "../components/player";
import { VisibleObjects } from "../components/visible_objects";

/** Owning systems write outbound packets here directly (no PacketSystem bridge). */
export const worldPacketManager = new WorldPacketManager<
    typeof Schema.Server,
    ServerPacketMap
>(Schema.Server);

export const playerPacketManager = new PlayerPacketManager<
    typeof Schema.Server,
    ServerPacketMap
>(Schema.Server);

playerPacketManager.visibleObjectsCallback = (player) => {
    return player.get(VisibleObjects).visible.values();
};

export const socketManager = new SocketManager();
