import fs from "node:fs";
import path from "node:path";

export type PackManifest = {
    id: string;
    format: number;
    version: string;
    depends: string[];
};

export type Pack = {
    directory: string;
    manifest: PackManifest;
};

export type SourcedRecord = {
    namespace: string;
    source: string;
    value: unknown;
};

export type SourcedTag = SourcedRecord & {
    replace: boolean;
    values: string[];
    category: boolean;
};

function object(value: unknown, source: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function manifest(directory: string): PackManifest {
    const filename = path.join(directory, "pack.yml");
    const raw = object(Bun.YAML.parse(fs.readFileSync(filename, "utf8")), filename);
    if (typeof raw.id !== "string" || !raw.id) {
        throw new Error(`${filename}.id: expected a non-empty string`);
    }
    if (raw.format !== 1) {
        throw new Error(`${filename}.format: unsupported pack format ${raw.format}`);
    }
    if (typeof raw.version !== "string" || !raw.version) {
        throw new Error(`${filename}.version: expected a non-empty string`);
    }
    if (!Array.isArray(raw.depends) || raw.depends.some((id) => typeof id !== "string")) {
        throw new Error(`${filename}.depends: expected a string array`);
    }
    return {
        id: raw.id,
        format: raw.format,
        version: raw.version,
        depends: raw.depends as string[],
    };
}

function files(directory: string): string[] {
    if (!fs.existsSync(directory)) return [];
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const filename = path.join(directory, entry.name);
            return entry.isDirectory() ? files(filename) : [filename];
        })
        .sort((left, right) => left.localeCompare(right));
}

function dataNamespaces(pack: Pack): string[] {
    const dataRoot = path.join(pack.directory, "data");
    if (!fs.existsSync(dataRoot)) return [];
    return fs
        .readdirSync(dataRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
}

function orderPacks(packs: ReadonlyMap<string, Pack>): Pack[] {
    const ordered: Pack[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
        if (visited.has(id)) return;
        if (visiting.has(id)) throw new Error(`Pack dependency cycle at "${id}"`);
        const pack = packs.get(id);
        if (!pack) throw new Error(`Missing required pack "${id}"`);
        visiting.add(id);
        for (const dependency of pack.manifest.depends) visit(dependency);
        visiting.delete(id);
        visited.add(id);
        ordered.push(pack);
    };
    for (const id of [...packs.keys()].sort()) visit(id);
    return ordered;
}

export class PackStack {
    readonly packs: readonly Pack[];

    constructor(root: string) {
        const discovered = new Map<string, Pack>();
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const directory = path.join(root, entry.name);
            const packManifest = manifest(directory);
            if (discovered.has(packManifest.id)) {
                throw new Error(`Duplicate pack id "${packManifest.id}"`);
            }
            discovered.set(packManifest.id, { directory, manifest: packManifest });
        }
        this.packs = orderPacks(discovered);
        if (!discovered.has("bundu")) throw new Error('Missing required base pack "bundu"');
    }

    document(namespace: string, resource: string): unknown {
        let result: unknown;
        for (const pack of this.packs) {
            const filename = path.join(
                pack.directory,
                "data",
                namespace,
                `${resource}.yml`
            );
            if (!fs.existsSync(filename)) continue;
            result = Bun.YAML.parse(fs.readFileSync(filename, "utf8"));
        }
        if (result === undefined) {
            throw new Error(`Missing data resource ${namespace}:${resource}`);
        }
        return result;
    }

    records(namespace: string, resource: string): Record<string, unknown> {
        const merged: Record<string, unknown> = {};
        let found = false;
        for (const pack of this.packs) {
            const filename = path.join(
                pack.directory,
                "data",
                namespace,
                `${resource}.yml`
            );
            if (!fs.existsSync(filename)) continue;
            Object.assign(
                merged,
                object(Bun.YAML.parse(fs.readFileSync(filename, "utf8")), filename)
            );
            found = true;
        }
        if (!found) throw new Error(`Missing data resource ${namespace}:${resource}`);
        return merged;
    }

    registryRecords(resource: string): Map<string, SourcedRecord> {
        const merged = new Map<string, SourcedRecord>();
        for (const pack of this.packs) {
            for (const namespace of dataNamespaces(pack)) {
                const filename = path.join(
                    pack.directory,
                    "data",
                    namespace,
                    `${resource}.yml`
                );
                if (!fs.existsSync(filename)) continue;
                const records = object(
                    Bun.YAML.parse(fs.readFileSync(filename, "utf8")),
                    filename
                );
                for (const [id, value] of Object.entries(records)) {
                    merged.set(`${namespace}:${id}`, {
                        namespace,
                        source: `${filename}.${id}`,
                        value,
                    });
                }
            }
        }
        return merged;
    }

    registryDefinitions(resource: string): Map<string, SourcedRecord> {
        const merged = new Map<string, SourcedRecord>();
        for (const pack of this.packs) {
            for (const namespace of dataNamespaces(pack)) {
                const root = path.join(pack.directory, "data", namespace, resource);
                for (const filename of files(root).filter((entry) => /\.ya?ml$/i.test(entry))) {
                    const relative = path
                        .relative(root, filename)
                        .replaceAll("\\", "/")
                        .replace(/\.ya?ml$/i, "");
                    merged.set(`${namespace}:${relative}`, {
                        namespace,
                        source: filename,
                        value: Bun.YAML.parse(fs.readFileSync(filename, "utf8")),
                    });
                }
            }
        }
        return merged;
    }

    registryTags(registry: string): Map<string, SourcedTag[]> {
        const merged = new Map<string, SourcedTag[]>();
        for (const pack of this.packs) {
            for (const namespace of dataNamespaces(pack)) {
                const root = path.join(
                    pack.directory,
                    "data",
                    namespace,
                    "tags",
                    registry
                );
                for (const filename of files(root).filter((entry) => /\.ya?ml$/i.test(entry))) {
                    const relative = path
                        .relative(root, filename)
                        .replaceAll("\\", "/")
                        .replace(/\.ya?ml$/i, "");
                    const raw = object(
                        Bun.YAML.parse(fs.readFileSync(filename, "utf8")),
                        filename
                    );
                    if (!Array.isArray(raw.values) || raw.values.some((value) => typeof value !== "string")) {
                        throw new Error(`${filename}.values: expected a string array`);
                    }
                    if (raw.replace !== undefined && typeof raw.replace !== "boolean") {
                        throw new Error(`${filename}.replace: expected a boolean`);
                    }
                    if (raw.category !== undefined && typeof raw.category !== "boolean") {
                        throw new Error(`${filename}.category: expected a boolean`);
                    }
                    const id = `#${namespace}:${relative}`;
                    const sources = merged.get(id) ?? [];
                    sources.push({
                        namespace,
                        source: filename,
                        replace: raw.replace === true,
                        category: raw.category === true,
                        values: raw.values as string[],
                        value: raw,
                    });
                    merged.set(id, sources);
                }
            }
        }
        return merged;
    }
}

const defaultRoot = path.resolve(import.meta.dir, "../../../../packs");
export const packs = new PackStack(process.env.BUNDU_PACK_ROOT ?? defaultRoot);
