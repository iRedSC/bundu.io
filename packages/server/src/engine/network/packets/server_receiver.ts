import type {
    PacketGuards,
    SerializedPacket,
    Serializer,
} from "@bundu/shared";
import type { ClientPacketMap } from "@bundu/shared/packet_definitions";

type Handler<
    DataMap extends Record<number, object>,
    I extends keyof DataMap & number,
> = (playerId: number, packet: DataMap[I]) => void;

/** Queues client packets by player; dispatches `(playerId, packet)` on process. */
export class ServerPacketReceiver<
    DataMap extends Record<number, object> = ClientPacketMap,
> {
    packets = new Map<number, SerializedPacket[]>();
    private handlers = new Map<
        keyof DataMap & number,
        Handler<DataMap, keyof DataMap & number>
    >();

    constructor(
        private serializer: Serializer<DataMap>,
        private guards?: PacketGuards<DataMap>
    ) {}

    on<I extends keyof DataMap & number>(
        id: I,
        callback: Handler<DataMap, I>
    ) {
        this.handlers.set(
            id,
            callback as Handler<DataMap, keyof DataMap & number>
        );
    }

    add(playerId: number, packet: SerializedPacket) {
        let packets = this.packets.get(playerId);
        if (!packets) {
            packets = [];
            this.packets.set(playerId, packets);
        }
        packets.push(packet);
    }

    process() {
        for (const [playerId, packets] of this.packets) {
            for (const packet of packets) {
                try {
                    const id = packet[0] as keyof DataMap & number;
                    const data = this.serializer.deserialize(
                        packet as [typeof id, ...unknown[]]
                    );
                    const guard = this.guards?.[id];
                    if (guard && !guard(data)) {
                        throw new Error(`Packet ${id} contains invalid values`);
                    }
                    this.handlers.get(id)?.(playerId, data);
                } catch (error) {
                    console.error(
                        `Dropped bad packet from player ${playerId}`,
                        packet,
                        error
                    );
                }
            }
        }
    }

    clear() {
        this.packets.clear();
    }
}
