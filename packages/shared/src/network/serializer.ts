type PacketSchemaEntry = { readonly fields: readonly string[] };
type PacketSchema = Record<number, PacketSchemaEntry>;

/** Packet payloads are plain field bags — never `any`. */
type PacketData = object;

function fieldValue(data: object, field: string): unknown {
    return (data as Record<string, unknown>)[field];
}

export class Serializer<
    S extends PacketSchema,
    DataMap extends Record<number, PacketData>,
> {
    private schemas = new Map<number, PacketSchemaEntry>();

    constructor(schema: S) {
        for (const [id, def] of Object.entries(schema)) {
            this.schemas.set(Number(id), def);
        }
    }

    serialize<I extends keyof S & number>(
        id: I,
        data: I extends keyof DataMap ? DataMap[I] : never
    ): [I, ...unknown[]] {
        const schema = this.schemas.get(id);
        if (!schema) throw new Error(`Schema ${id} not found`);
        return [id, ...schema.fields.map((f) => fieldValue(data, f))] as [
            I,
            ...unknown[],
        ];
    }

    deserialize<I extends keyof S & number>(
        packet: readonly [I, ...unknown[]]
    ): I extends keyof DataMap ? DataMap[I] & { id: I } : never {
        const id = packet[0];
        const schema = this.schemas.get(id);
        if (!schema) throw new Error(`Schema ${id} not found`);
        if (packet.length !== schema.fields.length + 1) {
            throw new Error(
                `Packet ${id} field count mismatch: got ${packet.length - 1}, expected ${schema.fields.length}`
            );
        }

        const result: Record<string, unknown> = { id };
        schema.fields.forEach((f, i) => {
            result[f] = packet[i + 1];
        });
        return result as I extends keyof DataMap ? DataMap[I] & { id: I } : never;
    }
}
