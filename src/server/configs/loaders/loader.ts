import { ZodTypeAny } from "zod";
import { mergeObjects } from "../../../lib/object_utils.js";
import { ReversableMap } from "../../../shared/reverseable_map.js";

/**
 * Loads configs and allows for easy access of records within said config.
 */
export class ConfigLoader<D extends object> {
    entries: Map<string, D> = new Map();
    guard: ZodTypeAny;
    fallback: D;
    idMap: ReversableMap<string, number>;

    constructor(
        guard: ZodTypeAny,
        fallback: D,
        idMap: ReversableMap<string, number>
    ) {
        this.idMap = idMap;
        this.guard = guard;
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
        if (typeof id === "number") id = this.idMap.getv(id);
        if (id === undefined) return this.fallback;
        return this.entries.get(id) ?? this.fallback;
    }
}
