import { Serializer } from "@bundu/shared";
import type { GameObject } from "../../game_object";

type PacketData<I, DataMap> = I extends keyof DataMap ? DataMap[I] : never;

type WorldPacketContainer<I, DataMap> = Map<I, PacketData<I, DataMap>>;

export class WorldPacketManager<
    S extends Record<number, { fields: readonly string[] }>,
    DataMap extends Record<number, object>
> {
    objects: Map<number, WorldPacketContainer<keyof S & number, DataMap>>;
    private schemas = new Map<number, S[keyof S & number]>();
    private serializer: Serializer<S, DataMap>;

    constructor(schema: S) {
        this.objects = new Map();
        for (const [id, def] of Object.entries(schema)) {
            this.schemas.set(Number(id), def as S[keyof S & number]);
        }
        this.serializer = new Serializer<S, DataMap>(schema);
    }

    add<I extends keyof S & number>(
        id: I,
        data: PacketData<I, DataMap> & { id: number }
    ) {
        if (!this.schemas.has(id)) {
            return console.error(`Schema ${id} not found`);
        }

        if (!data.id) {
            return console.error(`Object id not found in packet ${id}`);
        }

        let packets = this.objects.get(data.id);
        if (!packets) packets = new Map();
        packets.set(id, data);
        this.objects.set(data.id, packets);
    }

    process(objects: IterableIterator<GameObject>) {
        const packets: unknown[] = [];
        for (const object of objects) {
            const objectPackets = this.objects.get(object.id);
            objectPackets
                ?.entries()
                .forEach(([id, data]) =>
                    packets.push(this.serializer.serialize(id, data))
                );
        }
        return packets;
    }

    clear() {
        this.objects.clear();
    }
}
