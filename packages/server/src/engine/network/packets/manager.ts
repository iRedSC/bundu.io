import type { Serializer, SerializedPacket } from "@bundu/shared";
import type {
    ServerPacketMap,
    ServerPacketID,
} from "@bundu/shared/packet_definitions";
import type { GameObject } from "../../game_object";
import type { WorldPacketManager } from "./world";
import type { SocketManager } from "../socket_manager";
import { encode } from "@msgpack/msgpack";
import { serverTime } from "../../server_time";

/** Per-player outbound queue: exclusive state (`set`) + multi packets (`add`). */
export class PlayerPacketManager {
    private state = new Map<number, Map<ServerPacketID, object>>();
    private multi = new Map<number, Map<ServerPacketID, object[]>>();

    constructor(private serializer: Serializer<ServerPacketMap>) {}

    visibleObjectsCallback?: (
        player: GameObject
    ) => IterableIterator<GameObject>;

    /** Latest-wins state for this player (vitals, recipes, etc.). */
    set<I extends ServerPacketID>(
        playerId: number,
        packetId: I,
        data: ServerPacketMap[I]
    ) {
        let packets = this.state.get(playerId);
        if (!packets) {
            packets = new Map();
            this.state.set(playerId, packets);
        }
        packets.set(packetId, data);
    }

    /** Append a packet (LoadObject, DeleteObjects — many per tick). */
    add<I extends ServerPacketID>(
        playerId: number,
        packetId: I,
        data: ServerPacketMap[I]
    ) {
        let packets = this.multi.get(playerId);
        if (!packets) {
            packets = new Map();
            this.multi.set(playerId, packets);
        }
        let list = packets.get(packetId);
        if (!list) {
            list = [];
            packets.set(packetId, list);
        }
        list.push(data);
    }

    process(
        players: GameObject[],
        socketManager: SocketManager,
        worldPacketManager: WorldPacketManager
    ) {
        for (const player of players) {
            const id = player.id;
            const packets: SerializedPacket[] = [];
            const socket = socketManager.getSocket(id);
            if (!socket) {
                console.error("No socket available to send to");
                continue;
            }

            const playerState = this.state.get(id);
            const playerMulti = this.multi.get(id);

            playerState?.forEach((data, packetId) => {
                packets.push(
                    this.serializer.serialize(
                        packetId,
                        data as ServerPacketMap[typeof packetId]
                    )
                );
            });
            playerMulti?.forEach((list, packetId) => {
                for (const data of list) {
                    packets.push(
                        this.serializer.serialize(
                            packetId,
                            data as ServerPacketMap[typeof packetId]
                        )
                    );
                }
            });

            const visibleObjects = this.visibleObjectsCallback?.(player);
            if (visibleObjects) {
                packets.push(...worldPacketManager.process(visibleObjects));
            } else {
                console.error(
                    "No visibleObjects callback provided to PlayerPacketManager!"
                );
            }

            if (packets.length > 0) {
                socket.send(encode([serverTime.now(), ...packets]));
            }
        }
    }

    clear() {
        this.state.clear();
        this.multi.clear();
    }
}
