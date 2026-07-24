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

export type PacketAdmissionOutcome =
    | "queued"
    | "coalesced"
    | "dropped"
    | "disconnect";

export type ReceiverLimits = {
    latestWinsIds: ReadonlySet<number>;
    maxReliableQueue: number;
    maxPacketsPerPlayerTick: number;
    maxPacketsGlobalTick: number;
    overflowOutcome: "dropped" | "disconnect";
};

const DEFAULT_LIMITS: ReceiverLimits = {
    latestWinsIds: new Set(),
    maxReliableQueue: 128,
    maxPacketsPerPlayerTick: 32,
    maxPacketsGlobalTick: 2_048,
    overflowOutcome: "disconnect",
};

type PlayerQueue = {
    reliable: SerializedPacket[];
    latest: Map<number, SerializedPacket>;
};

/** Bounded, fair client-packet admission and tick dispatch. */
export class ServerPacketReceiver<
    DataMap extends Record<number, object> = ClientPacketMap,
> {
    readonly packets = new Map<number, SerializedPacket[]>();
    private readonly queues = new Map<number, PlayerQueue>();
    private readonly handlers = new Map<
        keyof DataMap & number,
        Handler<DataMap, keyof DataMap & number>
    >();
    private readonly limits: ReceiverLimits;
    private nextPlayerIndex = 0;

    constructor(
        private readonly serializer: Serializer<DataMap>,
        private readonly guards?: PacketGuards<DataMap>,
        limits: Partial<ReceiverLimits> = {}
    ) {
        this.limits = { ...DEFAULT_LIMITS, ...limits };
    }

    on<I extends keyof DataMap & number>(
        id: I,
        callback: Handler<DataMap, I>
    ) {
        this.handlers.set(
            id,
            callback as Handler<DataMap, keyof DataMap & number>
        );
    }

    add(playerId: number, packet: SerializedPacket): PacketAdmissionOutcome {
        let queue = this.queues.get(playerId);
        if (!queue) {
            queue = { reliable: [], latest: new Map() };
            this.queues.set(playerId, queue);
        }
        if (this.limits.latestWinsIds.has(packet[0])) {
            const outcome = queue.latest.has(packet[0])
                ? "coalesced"
                : "queued";
            queue.latest.set(packet[0], packet);
            return outcome;
        }
        if (queue.reliable.length >= this.limits.maxReliableQueue) {
            return this.limits.overflowOutcome;
        }
        queue.reliable.push(packet);
        return "queued";
    }

    process() {
        let globalRemaining = this.limits.maxPacketsGlobalTick;
        const players = [...this.queues.entries()];
        if (players.length === 0) return;
        const start = this.nextPlayerIndex % players.length;
        const ordered = [
            ...players.slice(start),
            ...players.slice(0, start),
        ];
        let visited = 0;
        for (const [playerId, queue] of ordered) {
            if (globalRemaining === 0) break;
            visited++;
            const playerBudget = Math.min(
                this.limits.maxPacketsPerPlayerTick,
                globalRemaining
            );
            const latest = [...queue.latest.values()].slice(0, playerBudget);
            const reliable = queue.reliable.slice(
                0,
                playerBudget - latest.length
            );
            const admitted = [...latest, ...reliable];
            this.packets.set(playerId, admitted);
            for (const packet of latest) queue.latest.delete(packet[0]);
            queue.reliable.splice(0, reliable.length);
            globalRemaining -= admitted.length;
            for (const packet of admitted) this.dispatch(playerId, packet);
        }
        this.nextPlayerIndex = (start + Math.max(1, visited)) % players.length;
    }

    private dispatch(playerId: number, packet: SerializedPacket): void {
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

    clear() {
        this.packets.clear();
        for (const [playerId, queue] of this.queues) {
            if (queue.reliable.length === 0 && queue.latest.size === 0) {
                this.queues.delete(playerId);
            }
        }
    }
}
