import { type SerializedPacket, type Serializer } from "@bundu/shared";
import type { ServerPacketMap } from "@bundu/shared/packet_definitions";
import { serverTime } from "@client/globals";

export type SerializedPacketArray = [number, ...SerializedPacket[]];

type Handler<
    DataMap extends Record<number, object>,
    I extends keyof DataMap & number,
> = (packet: DataMap[I], timestamp: number) => void;

/** Batch is `[timestamp, ...packets]`; callbacks get `(packet, timestamp)`. */
export class ClientPacketReceiver<
    DataMap extends Record<number, object> = ServerPacketMap,
> {
    private handlers = new Map<
        keyof DataMap & number,
        Handler<DataMap, keyof DataMap & number>
    >();

    constructor(private serializer: Serializer<DataMap>) {}

    on<I extends keyof DataMap & number>(
        id: I,
        callback: Handler<DataMap, I>
    ) {
        this.handlers.set(
            id,
            callback as Handler<DataMap, keyof DataMap & number>
        );
    }

    process(packets: SerializedPacketArray) {
        const [timestamp, ...rest] = packets;
        serverTime.sync(timestamp);

        for (const packet of rest) {
            try {
                const id = packet[0] as keyof DataMap & number;
                const data = this.serializer.deserialize(
                    packet as [typeof id, ...unknown[]]
                );
                this.handlers.get(id)?.(data, timestamp);
            } catch (error) {
                console.error("Dropped bad packet", packet, error);
            }
        }
    }
}
