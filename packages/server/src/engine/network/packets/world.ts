import type { Serializer, SerializedPacket } from "@bundu/shared";
import type {
    ServerPacketMap,
    ServerPacketID,
} from "@bundu/shared/packet_definitions";
import type { GameObject } from "../../game_object";

type ObjectPacket = ServerPacketMap[ServerPacketID] & { id: number };

/**
 * Per-object outbound queue, processed only for visible objects.
 * - `set`: latest-wins state (position, rotation)
 * - `emit`: append-only events (hits, attacks, chat)
 *
 * Optional `forwardEmitId` dual-queues emit packets onto an alias id
 * (e.g. anon proxy) so viewers who only hold the stand-in still get FX.
 */
export class WorldPacketManager {
    private state = new Map<number, Map<ServerPacketID, ObjectPacket>>();
    private events = new Map<number, [ServerPacketID, ObjectPacket][]>();

    /** When set, every emit is also queued under the returned id (if any). */
    forwardEmitId?: (id: number) => number | undefined;

    constructor(private serializer: Serializer<ServerPacketMap>) {}

    /** Latest-wins state sync for an object. */
    set<I extends ServerPacketID>(
        packetId: I,
        data: ServerPacketMap[I] & { id: number }
    ) {
        let packets = this.state.get(data.id);
        if (!packets) {
            packets = new Map();
            this.state.set(data.id, packets);
        }
        packets.set(packetId, data);
    }

    /** Append an event for an object (multiple per tick are kept). */
    emit<I extends ServerPacketID>(
        packetId: I,
        data: ServerPacketMap[I] & { id: number }
    ) {
        this.pushEvent(packetId, data);
        const forwardId = this.forwardEmitId?.(data.id);
        if (forwardId !== undefined && forwardId !== data.id) {
            this.pushEvent(packetId, { ...data, id: forwardId });
        }
    }

    private pushEvent<I extends ServerPacketID>(
        packetId: I,
        data: ServerPacketMap[I] & { id: number }
    ) {
        let list = this.events.get(data.id);
        if (!list) {
            list = [];
            this.events.set(data.id, list);
        }
        list.push([packetId, data]);
    }

    process(objects: IterableIterator<GameObject>): SerializedPacket[] {
        const packets: SerializedPacket[] = [];
        for (const object of objects) {
            const objectState = this.state.get(object.id);
            objectState?.forEach((data, packetId) => {
                packets.push(
                    this.serializer.serialize(
                        packetId,
                        data as ServerPacketMap[typeof packetId]
                    )
                );
            });

            const objectEvents = this.events.get(object.id);
            if (objectEvents) {
                for (const [packetId, data] of objectEvents) {
                    packets.push(
                        this.serializer.serialize(
                            packetId,
                            data as ServerPacketMap[typeof packetId]
                        )
                    );
                }
            }
        }
        return packets;
    }

    clear() {
        this.state.clear();
        this.events.clear();
    }
}
