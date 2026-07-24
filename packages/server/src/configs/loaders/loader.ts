import { mergeObjects } from "@bundu/shared";
import {
    resourceLocation,
    type RegistryId,
    type RegistryName,
} from "@bundu/shared/registry";
import { gameRegistries } from "../registries.js";

/**
 * Loads configs and allows for easy access of records within said config.
 */
export class ConfigLoader<K extends RegistryName, D extends object> {
    entries: Map<string, D> = new Map();
    fallback: D;

    constructor(
        readonly registryName: K,
        fallback: D
    ) {
        this.fallback = fallback;
    }

    parse(
        records: Record<string, Partial<D>>,
        callback?: (id: string, record: Partial<D>, fallback: D) => D
    ) {
        this.entries.clear();
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

    get(id?: string | RegistryId<K>) {
        if (id === undefined) return this.fallback;
        if (typeof id === "number") {
            // Type.id is registry-local; callers may pass a resource id into a
            // structure loader (shared TileEntity). Unknown ids → fallback.
            const location = gameRegistries()[this.registryName].tryLocation(id);
            if (location === undefined) return this.fallback;
            return this.entries.get(location) ?? this.fallback;
        }
        return this.entries.get(resourceLocation(id, "bundu")) ?? this.fallback;
    }
}
