import { Serializer } from "../../../shared/network/serializer";
import type { GameObject } from "../../game_engine/game_object";

type WorldPacketContainer<I, DataMap> = Map<
    I,
    I extends keyof DataMap ? DataMap[I] & Record<string, any> : never
>;

export class WorldPacketManager<
    S extends Record<
        number,
        {
            fields: readonly string[];
            validator: (v: any) => boolean;
        }
    >,
    DataMap extends Record<number, any>
> {
    objects: Map<number, WorldPacketContainer<keyof S & number, DataMap>>;
    private schemas = new Map<number, S[keyof S & number]>();
    private serializer: Serializer<S, DataMap>;

    constructor(schema: S) {
        this.objects = new Map();
        for (const [id, def] of Object.entries(schema)) {
            this.schemas.set(Number(id), def as any);
        }
        this.serializer = new Serializer<S, DataMap>(schema);
    }

    add<I extends keyof S & number>(
        id: I,
        data: I extends keyof DataMap ? DataMap[I] & Record<string, any> : never
    ) {
        const schema = this.schemas.get(id);

        if (!schema) return console.error(`Schema ${id} not found`);

        if (!schema.validator(data))
            return console.error(`Validation failed: ${id}`);

        if (!data.id)
            return console.error(`Object id not found in packet ${id}`);

        let packets = this.objects.get(data.id);
        if (!packets) packets = new Map();
        packets.set(id, data);
        this.objects.set(data.id, packets);

        // console.log(data);
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
