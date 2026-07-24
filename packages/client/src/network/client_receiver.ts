import type { SerializedPacket, Serializer } from "@bundu/shared";
import type { ServerPacketMap } from "@bundu/shared/packet_definitions";
import { clientTime } from "@client/globals";

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
        Set<Handler<DataMap, keyof DataMap & number>>
    >();

    constructor(private serializer: Serializer<DataMap>) {}

    on<I extends keyof DataMap & number>(
        id: I,
        callback: Handler<DataMap, I>
    ): () => void {
        const handler = callback as Handler<
            DataMap,
            keyof DataMap & number
        >;
        const handlers = this.handlers.get(id) ?? new Set();
        handlers.add(handler);
        this.handlers.set(id, handlers);

        return () => {
            handlers.delete(handler);
            if (handlers.size === 0) this.handlers.delete(id);
        };
    }

    process(packets: SerializedPacketArray) {
        const [timestamp, ...rest] = packets;
        clientTime.synchronize(timestamp);

        for (const packet of rest) {
            try {
                const id = packet[0] as keyof DataMap & number;
                const data = this.serializer.deserialize(
                    packet as [typeof id, ...unknown[]]
                );
                for (const handler of this.handlers.get(id) ?? []) {
                    handler(data, timestamp);
                }
            } catch (error) {
                console.error("Dropped bad packet", packet, error);
            }
        }
    }
}
