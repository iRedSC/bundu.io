import { Serializer } from "@bundu/shared";
import type { GameObject } from "../../game_object";
import type { WorldPacketManager } from "./world";
import type { SocketManager } from "../socket_manager";
import { encode } from "@msgpack/msgpack";
import { serverTime } from "../../server_time";

type PacketData<I, DataMap> = I extends keyof DataMap ? DataMap[I] : never;

type PlayerPacketContainer<I, DataMap> = Map<I, PacketData<I, DataMap>>;

type NonExclusivePlayerPacketContainer<I, DataMap> = Map<
    I,
    PacketData<I, DataMap>[]
>;

export class PlayerPacketManager<
    S extends Record<number, { fields: readonly string[] }>,
    DataMap extends Record<number, object>
> {
    packets = new Map<
        number,
        PlayerPacketContainer<keyof S & number, DataMap>
    >();
    nonExclusivePackets = new Map<
        number,
        NonExclusivePlayerPacketContainer<keyof S & number, DataMap>
    >();
    private schemas = new Map<number, S[keyof S & number]>();
    private serializer: Serializer<S, DataMap>;
    visibleObjectsCallback?: (
        player: GameObject
    ) => IterableIterator<GameObject>;

    constructor(schema: S) {
        this.packets = new Map();
        for (const [id, def] of Object.entries(schema)) {
            this.schemas.set(Number(id), def as S[keyof S & number]);
        }
        this.serializer = new Serializer<S, DataMap>(schema);
    }

    set<I extends keyof S & number>(
        playerId: number,
        packetId: I,
        data: PacketData<I, DataMap>
    ) {
        if (!this.schemas.has(packetId)) {
            return console.error(`Schema ${packetId} not found`);
        }

        let packets = this.packets.get(playerId);
        if (!packets) packets = new Map();
        packets.set(packetId, data);
        this.packets.set(playerId, packets);
    }

    add<I extends keyof S & number>(
        playerId: number,
        packetId: I,
        data: PacketData<I, DataMap>
    ) {
        if (!this.schemas.has(packetId)) {
            return console.error(`Schema ${packetId} not found`);
        }

        let packets = this.nonExclusivePackets.get(playerId);
        if (!packets) packets = new Map();
        let list = packets.get(packetId);
        if (!list) {
            list = [];
            packets.set(packetId, list);
        }
        list.push(data);

        this.nonExclusivePackets.set(playerId, packets);
    }

    process(
        players: GameObject[],
        socketManager: SocketManager,
        worldPacketManager: WorldPacketManager<S, DataMap>
    ) {
        for (const player of players) {
            const id = player.id;
            const packets: [number, ...unknown[]] = [0];
            const socket = socketManager.getSocket(id);
            const playerPackets = this.packets.get(id);
            const nonExclusivePlayerPackets = this.nonExclusivePackets.get(id);
            if (!socket) {
                console.error("No socket available to send to");
                continue;
            }

            const visibleObjects = this.visibleObjectsCallback?.(player);

            playerPackets
                ?.entries()
                .forEach(([id, data]) =>
                    packets.push(this.serializer.serialize(id, data))
                );
            nonExclusivePlayerPackets?.entries().forEach(([id, data]) => {
                for (const packet of data) {
                    packets.push(this.serializer.serialize(id, packet));
                }
            });

            if (visibleObjects) {
                packets.push(...worldPacketManager.process(visibleObjects));
            } else {
                console.error(
                    "No visibleObjects callback provided to PlayerPacketManager!"
                );
            }

            packets[0] = serverTime.now();

            if (packets.length > 1) socket.send(encode(packets));
        }
    }

    clear() {
        this.packets.clear();
        this.nonExclusivePackets.clear();
    }
}
