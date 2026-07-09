import type { Serializer } from "../../../shared/network/serializer";

type SerializedPacket = [number, ...unknown[]];

type Callback<I, DataMap> = (
    playerId: number,
    packet: I extends keyof DataMap ? DataMap[I] & Record<string, any> : never
) => void;
type CallbackMap<I, DataMap> = Map<I, Callback<I, DataMap>>;

export class ServerPacketReceiver<
    S extends Record<number, { fields: readonly string[] }>,
    DataMap extends Record<number, any>
> {
    callbacks: CallbackMap<keyof S & number, DataMap> = new Map();
    serializer: Serializer<S, DataMap>;
    packets = new Map<number, SerializedPacket[]>();

    constructor(serializer: Serializer<S, DataMap>) {
        this.serializer = serializer;
    }

    on<I extends keyof S & number>(id: I, callback: Callback<I, DataMap>) {
        this.callbacks.set(id, callback as Callback<keyof S & number, DataMap>);
    }

    add(playerId: number, packet: SerializedPacket) {
        let packets = this.packets.get(playerId);
        if (!packets) packets = [];
        packets.push(packet);
        this.packets.set(playerId, packets);
    }

    process() {
        for (const [player, packets] of this.packets.entries()) {
            for (const packet of packets) {
                try {
                    const id = packet[0];
                    const deserialized = this.serializer.deserialize(packet);
                    const callback = this.callbacks.get(id);
                    callback?.(player, deserialized);
                } catch (error) {
                    console.error(
                        `Dropped bad packet from player ${player}`,
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
