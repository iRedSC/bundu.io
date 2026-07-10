import {
    PacketReceiver,
    type SerializedPacket,
} from "@bundu/shared";

type Callback<I, DataMap> = (
    playerId: number,
    packet: I extends keyof DataMap ? DataMap[I] : never
) => void;

/** Server adapter: queues by player; callbacks get `(playerId, packet)`. */
export class ServerPacketReceiver<
    S extends Record<number, { fields: readonly string[] }>,
    DataMap extends Record<number, object>,
> extends PacketReceiver<S, DataMap, number> {
    packets = new Map<number, SerializedPacket[]>();

    on<I extends keyof S & number>(id: I, callback: Callback<I, DataMap>) {
        this.setHandler(id, (data, playerId) => {
            (callback as Callback<keyof S & number, DataMap>)(playerId, data as never);
        });
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
                this.receivePacket(
                    packet,
                    player,
                    `Dropped bad packet from player ${player}`
                );
            }
        }
    }

    clear() {
        this.packets.clear();
    }
}
