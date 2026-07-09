import type { Serializer } from "@ioengine/client";

export type SerializedPacketArray = [number, ...[number, ...unknown[]][]];

type Callback<I, DataMap> = (
    packet: I extends keyof DataMap ? DataMap[I] & Record<string, any> : never,
    timestamp: number
) => void;
type CallbackMap<I, DataMap> = Map<I, Callback<I, DataMap>>;

export class ClientPacketReceiver<
    S extends Record<number, { fields: readonly string[] }>,
    DataMap extends Record<number, any>
> {
    callbacks: CallbackMap<keyof S & number, DataMap> = new Map();
    serializer: Serializer<S, DataMap>;

    constructor(serializer: Serializer<S, DataMap>) {
        this.serializer = serializer;
    }

    on<I extends keyof S & number>(id: I, callback: Callback<I, DataMap>) {
        this.callbacks.set(id, callback as Callback<keyof S & number, DataMap>);
    }

    process(packets: SerializedPacketArray) {
        const [timestamp, ...rest] = packets;

        for (const packet of rest) {
            const id = packet[0];
            const deserialized = this.serializer.deserialize(packet);
            const callback = this.callbacks.get(id);
            callback?.(deserialized, timestamp);
        }
    }
}
