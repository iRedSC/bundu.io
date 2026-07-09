export class Serializer<
    S extends Record<number, { fields: readonly string[] }>,
    DataMap extends Record<number, any>
> {
    private schemas = new Map<number, S[keyof S & number]>();

    constructor(schema: S) {
        for (const [id, def] of Object.entries(schema)) {
            this.schemas.set(Number(id), def as any);
        }
    }

    serialize<I extends keyof S & number>(
        id: I,
        data: I extends keyof DataMap ? DataMap[I] & Record<string, any> : never
    ): [I, ...unknown[]] {
        const schema = this.schemas.get(id);
        if (!schema) throw new Error(`Schema ${id} not found`);
        return [id, ...schema.fields.map((f) => data[f])] as [I, ...unknown[]];
    }

    deserialize<I extends keyof S & number>(
        packet: [I | unknown, ...any[]]
    ): I extends keyof DataMap ? DataMap[I] & { id: I } : never {
        const id = packet[0];
        // @ts-expect-error
        const schema = this.schemas.get(id);
        if (!schema) throw new Error(`Schema ${id} not found`);

        const result: any = { id };
        schema.fields.forEach((f, i) => (result[f] = packet[i + 1]));
        return result;
    }
}
