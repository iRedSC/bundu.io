import {
    PacketReceiver,
    type SerializedPacket,
} from "@bundu/shared";
import { serverTime } from "@client/globals";

export type SerializedPacketArray = [number, ...SerializedPacket[]];

type Callback<I, DataMap> = (
    packet: I extends keyof DataMap ? DataMap[I] : never,
    timestamp: number
) => void;

/** Client adapter: batch is `[timestamp, ...packets]`; callbacks get `(packet, timestamp)`. */
export class ClientPacketReceiver<
    S extends Record<number, { fields: readonly string[] }>,
    DataMap extends Record<number, object>,
> extends PacketReceiver<S, DataMap, number> {
    on<I extends keyof S & number>(id: I, callback: Callback<I, DataMap>) {
        this.setHandler(
            id,
            callback as (data: DataMap[keyof DataMap & number], ctx: number) => void
        );
    }

    process(packets: SerializedPacketArray) {
        const [timestamp, ...rest] = packets;
        serverTime.sync(timestamp);

        for (const packet of rest) {
            this.receivePacket(packet, timestamp, "Dropped bad packet");
        }
    }
}
