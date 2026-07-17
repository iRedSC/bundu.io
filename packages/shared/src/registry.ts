export const REGISTRY_NAMES = [
    "item",
    "structure",
    "resource",
    "entity_type",
    "ground_type",
    "recipe",
    "loot_table",
] as const;

export type RegistryName = (typeof REGISTRY_NAMES)[number];
export type ResourceLocation = `${string}:${string}`;
export type TagLocation = `#${string}:${string}`;
export type RegistryId<K extends RegistryName> = number & {
    readonly __registry?: K;
};
export type RegistryEntryRef = ResourceLocation | TagLocation;

export type RegistryTagSource = {
    replace?: boolean;
    values: readonly string[];
    /** When true, this tag appears as an editor palette tab. */
    category?: boolean;
};

export type RegistryTagProjection = {
    id: TagLocation;
    values: readonly RegistryEntryRef[];
    category: boolean;
};

export type RegistryProjection<K extends RegistryName = RegistryName> = {
    name: K;
    entries: readonly (readonly [ResourceLocation, RegistryId<K>])[];
    tags: readonly RegistryTagProjection[];
};

export type RegistrySetProjection = {
    /** 2: tags are `{ id, values, category }` objects (was format-1 tuples). */
    format: 2;
    registries: {
        [K in RegistryName]: RegistryProjection<K>;
    };
};

export type ClientRegistryProjection = RegistrySetProjection & {
    structures: Record<
        number,
        {
            blocked: readonly { x: number; y: number }[];
            ground: readonly number[];
        }
    >;
    groundTypes: Record<number, { color: string }>;
};

const NAMESPACE = /^[a-z0-9_.-]+$/;
const PATH = /^[a-z0-9_./-]+$/;

function parseLocation(value: string, source: string): ResourceLocation {
    const separator = value.indexOf(":");
    if (separator <= 0 || separator !== value.lastIndexOf(":")) {
        throw new Error(`${source}: expected namespace:path`);
    }
    const namespace = value.slice(0, separator);
    const path = value.slice(separator + 1);
    if (!NAMESPACE.test(namespace) || !PATH.test(path)) {
        throw new Error(`${source}: invalid resource location "${value}"`);
    }
    return value as ResourceLocation;
}

export function resourceLocation(
    value: string,
    defaultNamespace?: string,
    source = "resource location"
): ResourceLocation {
    const qualified = value.includes(":")
        ? value
        : defaultNamespace
          ? `${defaultNamespace}:${value}`
          : value;
    return parseLocation(qualified, source);
}

export function tagLocation(value: string, source = "tag"): TagLocation {
    if (!value.startsWith("#")) {
        throw new Error(`${source}: expected #namespace:path`);
    }
    return `#${parseLocation(value.slice(1), source)}` as TagLocation;
}

export function registryReference(
    value: string,
    defaultNamespace?: string,
    source = "registry reference"
): RegistryEntryRef {
    return value.startsWith("#")
        ? tagLocation(value, source)
        : resourceLocation(value, defaultNamespace, source);
}

export function isTagLocation(value: string): value is TagLocation {
    return value.startsWith("#");
}

export class Registry<K extends RegistryName> {
    readonly name: K;
    private readonly ids = new Map<ResourceLocation, RegistryId<K>>();
    private readonly locations = new Map<RegistryId<K>, ResourceLocation>();
    private readonly tags = new Map<TagLocation, readonly RegistryEntryRef[]>();
    private readonly tagCategories = new Set<TagLocation>();

    constructor(name: K, entries: Iterable<string>) {
        this.name = name;
        const locations = [...entries].map((entry) => resourceLocation(entry));
        locations.sort((left, right) => left.localeCompare(right));
        for (const [index, location] of locations.entries()) {
            if (this.ids.has(location)) {
                throw new Error(`${name}: duplicate entry "${location}"`);
            }
            const id = (index + 1) as RegistryId<K>;
            this.ids.set(location, id);
            this.locations.set(id, location);
        }
    }

    static hydrate<K extends RegistryName>(projection: RegistryProjection<K>): Registry<K> {
        const registry = new Registry(projection.name, []);
        const seenIds = new Set<number>();
        for (const [rawLocation, rawId] of projection.entries) {
            const location = resourceLocation(rawLocation);
            if (!Number.isSafeInteger(rawId) || rawId <= 0) {
                throw new Error(`${projection.name}: invalid numeric id ${rawId}`);
            }
            if (registry.ids.has(location)) {
                throw new Error(`${projection.name}: duplicate entry "${location}"`);
            }
            if (seenIds.has(rawId)) {
                throw new Error(`${projection.name}: duplicate numeric id ${rawId}`);
            }
            const id = rawId as RegistryId<K>;
            registry.ids.set(location, id);
            registry.locations.set(id, location);
            seenIds.add(rawId);
        }
        for (const entry of projection.tags ?? []) {
            if (
                typeof entry !== "object" ||
                entry === null ||
                typeof entry.id !== "string" ||
                !Array.isArray(entry.values) ||
                typeof entry.category !== "boolean"
            ) {
                throw new Error(
                    `${projection.name}: tag entries must be { id, values, category } objects`
                );
            }
            const tag = tagLocation(entry.id);
            if (registry.tags.has(tag)) {
                throw new Error(`${projection.name}: duplicate tag "${tag}"`);
            }
            registry.tags.set(
                tag,
                entry.values.map((value, index) =>
                    registryReference(value, undefined, `${tag}.values[${index}]`)
                )
            );
            if (entry.category) registry.tagCategories.add(tag);
        }
        registry.validateTags();
        return registry;
    }

    get size(): number {
        return this.ids.size;
    }

    has(location: ResourceLocation): boolean {
        return this.ids.has(location);
    }

    id(location: ResourceLocation, source: string = this.name): RegistryId<K> {
        const id = this.ids.get(location);
        if (id === undefined) {
            throw new Error(`${source}: unknown ${this.name} "${location}"`);
        }
        return id;
    }

    location(id: RegistryId<K>, source: string = this.name): ResourceLocation {
        const location = this.locations.get(id);
        if (location === undefined) {
            throw new Error(`${source}: unknown ${this.name} id ${id}`);
        }
        return location;
    }

    entries(): IterableIterator<[ResourceLocation, RegistryId<K>]> {
        return this.ids.entries();
    }

    /** Tag location → member refs (for editor filters, tooling). */
    tagEntries(): IterableIterator<[TagLocation, readonly RegistryEntryRef[]]> {
        return this.tags.entries();
    }

    /** Tags flagged `category: true` for editor palette tabs. */
    categoryTagEntries(): IterableIterator<
        [TagLocation, readonly RegistryEntryRef[]]
    > {
        return (function* (tags, categories) {
            for (const [tag, values] of tags) {
                if (categories.has(tag)) yield [tag, values];
            }
        })(this.tags, this.tagCategories);
    }

    isCategoryTag(tag: TagLocation): boolean {
        return this.tagCategories.has(tag);
    }

    defineTag(
        tag: string,
        values: readonly string[],
        defaultNamespace?: string,
        category = false
    ): void {
        const location = tagLocation(tag);
        const parsed = values.map((value, index) =>
            registryReference(value, defaultNamespace, `${location}.values[${index}]`)
        );
        this.tags.set(location, parsed);
        if (category) this.tagCategories.add(location);
        else this.tagCategories.delete(location);
    }

    appendTag(
        tag: string,
        values: readonly string[],
        defaultNamespace?: string,
        category = false
    ): void {
        const location = tagLocation(tag);
        const previous = this.tags.get(location) ?? [];
        const parsed = values.map((value, index) =>
            registryReference(value, defaultNamespace, `${location}.values[${index}]`)
        );
        this.tags.set(location, [...previous, ...parsed]);
        if (category) this.tagCategories.add(location);
    }

    resolve(reference: string, defaultNamespace?: string, source: string = this.name): RegistryId<K> {
        const parsed = registryReference(reference, defaultNamespace, source);
        if (isTagLocation(parsed)) {
            throw new Error(`${source}: expected one ${this.name}, received tag "${parsed}"`);
        }
        return this.id(parsed, source);
    }

    resolveSet(
        references: readonly string[],
        defaultNamespace?: string,
        source: string = this.name
    ): readonly RegistryId<K>[] {
        const result: RegistryId<K>[] = [];
        const seen = new Set<RegistryId<K>>();
        const visiting = new Set<TagLocation>();

        const add = (reference: RegistryEntryRef, path: string) => {
            if (!isTagLocation(reference)) {
                const id = this.id(reference, path);
                if (!seen.has(id)) {
                    seen.add(id);
                    result.push(id);
                }
                return;
            }
            if (visiting.has(reference)) {
                throw new Error(`${path}: tag cycle at "${reference}"`);
            }
            const values = this.tags.get(reference);
            if (!values) {
                throw new Error(`${path}: unknown ${this.name} tag "${reference}"`);
            }
            visiting.add(reference);
            for (const [index, value] of values.entries()) {
                add(value, `${reference}.values[${index}]`);
            }
            visiting.delete(reference);
        };

        for (const [index, value] of references.entries()) {
            add(
                registryReference(value, defaultNamespace, `${source}[${index}]`),
                `${source}[${index}]`
            );
        }
        return result;
    }

    validateTags(): void {
        for (const tag of this.tags.keys()) this.resolveSet([tag], undefined, tag);
    }

    toProjection(): RegistryProjection<K> {
        return {
            name: this.name,
            entries: [...this.ids.entries()],
            tags: [...this.tags.entries()].map(([id, values]) => ({
                id,
                values,
                category: this.tagCategories.has(id),
            })),
        };
    }
}

export function registrySetProjection(
    registries: { [K in RegistryName]: Registry<K> }
): RegistrySetProjection {
    return {
        format: 2,
        registries: Object.fromEntries(
            REGISTRY_NAMES.map((name) => [name, registries[name].toProjection()])
        ) as RegistrySetProjection["registries"],
    };
}

export function hydrateRegistrySet(projection: RegistrySetProjection): {
    [K in RegistryName]: Registry<K>;
} {
    if (projection.format !== 2) {
        throw new Error(`Unsupported registry projection format ${projection.format}`);
    }
    return Object.fromEntries(
        REGISTRY_NAMES.map((name) => [name, Registry.hydrate(projection.registries[name])])
    ) as { [K in RegistryName]: Registry<K> };
}
