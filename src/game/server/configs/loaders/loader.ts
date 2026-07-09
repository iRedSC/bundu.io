import { mergeObjects } from "@ioengine/lib";
import { getStringId } from "@shared/id_map";

/**
 * Loads configs and allows for easy access of records within said config.
 */
export class ConfigLoader<D extends object> {
    entries: Map<string, D> = new Map();
    fallback: D;

    constructor(fallback: D) {
        this.fallback = fallback;
    }

    parse(
        records: Record<string, Partial<D>>,
        callback?: (id: string, record: Partial<D>, fallback: D) => D
    ) {
        for (const [id, record] of Object.entries(records)) {
            const modifiedRecord = callback
                ? callback(id, record, this.fallback)
                : record;
            const fullRecord = mergeObjects(
                modifiedRecord,
                undefined,
                this.fallback
            );

            this.entries.set(id, fullRecord);
        }
    }

    get(id?: string | number) {
        if (typeof id === "number") id = getStringId(id);
        if (id === undefined) return this.fallback;
        return this.entries.get(id) ?? this.fallback;
    }
}
