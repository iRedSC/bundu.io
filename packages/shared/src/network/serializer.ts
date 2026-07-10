export type SerializedPacket = [number, ...unknown[]];

type PacketSchema = Record<number, { readonly fields: readonly string[] }>;

/** Packs/unpacks packets by field order. One type param: the ID → payload map. */
export class Serializer<DataMap extends Record<number, object>> {
    private schemas = new Map<number, { fields: readonly string[] }>();

    constructor(schema: PacketSchema) {
        for (const [id, def] of Object.entries(schema)) {
            this.schemas.set(Number(id), def);
        }
    }

    has(id: number): boolean {
        return this.schemas.has(id);
    }

    serialize<I extends keyof DataMap & number>(
        id: I,
        data: DataMap[I]
    ): [I, ...unknown[]] {
        const schema = this.schemas.get(id);
        if (!schema) throw new Error(`Schema ${id} not found`);
        return [
            id,
            ...schema.fields.map((f) => (data as Record<string, unknown>)[f]),
        ] as [I, ...unknown[]];
    }

    deserialize<I extends keyof DataMap & number>(
        packet: readonly [I, ...unknown[]]
    ): DataMap[I] {
        const id = packet[0];
        const schema = this.schemas.get(id);
        if (!schema) throw new Error(`Schema ${id} not found`);
        if (packet.length !== schema.fields.length + 1) {
            throw new Error(
                `Packet ${id} field count mismatch: got ${packet.length - 1}, expected ${schema.fields.length}`
            );
        }

        const result: Record<string, unknown> = {};
        schema.fields.forEach((f, i) => {
            result[f] = packet[i + 1];
        });
        return result as DataMap[I];
    }
}
