import fs from "node:fs";
import path from "node:path";
import {
    DATA_ONLY_DIRS,
    defaultModelPath,
    isRegistryKind,
    listFiles,
    listYamlFiles,
    packRoots,
    readText,
    splitDefSource,
    writeText,
    type RegistryKind,
} from "./shared";

export type GenerateOptions = {
    packRoot: string;
    /** When true, do not write; return whether output would change. */
    check?: boolean;
};

export type GenerateResult = {
    wrote: string[];
    removed: string[];
    unchanged: boolean;
};

export type GeneratedDocumentRole = "display" | "data";

export type ExplainedDestination = {
    role: GeneratedDocumentRole;
    path: string;
};

export type ExplainResult = {
    source: string;
    documents: readonly GeneratedDocumentRole[];
    destinations: readonly ExplainedDestination[];
};

type Planned = {
    filename: string;
    content: string | Uint8Array;
    source: string;
    role: GeneratedDocumentRole | "asset";
};

function rel(from: string, filename: string): string {
    return path.relative(from, filename).replaceAll("\\", "/");
}

/** Single-doc item_types entry that is a visual abstract, not gameplay data. */
function looksLikeItemTypeModel(yaml: string): boolean {
    const parsed = Bun.YAML.parse(yaml);
    const doc = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
    const record = doc as Record<string, unknown>;
    return (
        typeof record.id === "string" ||
        typeof record.extends === "string" ||
        record.abstract === true ||
        record.displays !== undefined ||
        record.parts !== undefined ||
        typeof record.texture === "string"
    );
}

function ensureSame(text: string): string {
    return text.endsWith("\n") ? text : `${text}\n`;
}

function contentEquals(
    left: string | Uint8Array | null | undefined,
    right: string | Uint8Array
): boolean {
    if (typeof left === "string" || typeof right === "string") {
        return typeof left === "string" && left === right;
    }
    if (!left || left.byteLength !== right.byteLength) return false;
    return left.every((byte, index) => byte === right[index]);
}

function sameContent(filename: string, content: string | Uint8Array): boolean {
    if (!fs.existsSync(filename)) return false;
    const current =
        typeof content === "string"
            ? readText(filename)
            : fs.readFileSync(filename);
    return contentEquals(current, content);
}

function modelEmitPath(
    registry: RegistryKind,
    stem: string,
    directiveModel: string | undefined
): string {
    if (directiveModel) return directiveModel;
    // Nested building defs encode the models/ subfolder:
    // buildings/walls/wood_wall.yml → models/walls/wood_wall.yml
    if (registry === "buildings" && stem.includes("/")) {
        return `models/${stem}.yml`;
    }
    const dataStem = stem.includes("/")
        ? stem.slice(stem.lastIndexOf("/") + 1)
        : stem;
    return defaultModelPath(registry, dataStem);
}

function dataStemFrom(stem: string): string {
    return stem.includes("/") ? stem.slice(stem.lastIndexOf("/") + 1) : stem;
}

function managedFiles(
    roots: ReturnType<typeof packRoots>,
    namespace: string
): string[] {
    const files = [
        ...listFiles(path.join(roots.data, namespace)),
        ...listFiles(path.join(roots.assets, namespace)),
    ];
    return files.sort((left, right) => left.localeCompare(right));
}

function clearManagedFiles(
    roots: ReturnType<typeof packRoots>,
    namespace: string
): string[] {
    const removed = managedFiles(roots, namespace);
    fs.rmSync(path.join(roots.data, namespace), { recursive: true, force: true });
    fs.rmSync(path.join(roots.assets, namespace), { recursive: true, force: true });
    return removed;
}

function planNamespace(
    packRoot: string,
    namespace: string
): Planned[] {
    const roots = packRoots(packRoot);
    const defsNs = path.join(roots.defs, namespace);
    const planned: Planned[] = [];
    const planWrite = (
        filename: string,
        content: string | Uint8Array,
        sourceFile: string,
        role: Planned["role"]
    ) => {
        const source = rel(packRoot, sourceFile);
        const existing = planned.find((entry) => entry.filename === filename);
        if (existing) {
            throw new Error(
                `${source}: collides with ${existing.source} at ${rel(roots.output, filename)}`
            );
        }
        planned.push({
            filename,
            content: typeof content === "string" ? ensureSame(content) : content,
            source,
            role,
        });
    };

    // item_types/: display → models/items/type/, data → data/item_types/
    const itemTypesRoot = path.join(defsNs, "item_types");
    for (const filename of listYamlFiles(itemTypesRoot)) {
        const stem = rel(itemTypesRoot, filename).replace(/\.ya?ml$/i, "");
        if (stem.includes("/")) {
            throw new Error(
                `${rel(packRoot, filename)}: item_types must be flat (no subfolders)`
            );
        }
        const split = splitDefSource(readText(filename), filename);
        const modelOut = path.join(
            roots.assets,
            namespace,
            "models/items/type",
            `${stem}.yml`
        );
        const dataOut = path.join(
            roots.data,
            namespace,
            "item_types",
            `${stem}.yml`
        );

        if (split.display !== null && split.data !== null) {
            planWrite(modelOut, split.display, filename, "display");
            planWrite(dataOut, split.data, filename, "data");
        } else if (split.display !== null) {
            planWrite(modelOut, split.display, filename, "display");
        } else if (split.data !== null) {
            // Single-doc: model-shaped (id/abstract/displays) → assets; else data.
            if (looksLikeItemTypeModel(split.data)) {
                planWrite(modelOut, split.data, filename, "display");
            } else {
                planWrite(dataOut, split.data, filename, "data");
            }
        } else {
            throw new Error(`${rel(packRoot, filename)}: empty item type`);
        }
    }

    for (const entry of fs.readdirSync(defsNs, { withFileTypes: true })) {
        if (
            entry.name === "models" ||
            entry.name === "client" ||
            entry.name === "item_types"
        ) {
            continue;
        }

        if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
            const sourceFile = path.join(defsNs, entry.name);
            const split = splitDefSource(readText(sourceFile), sourceFile);
            if (split.display) {
                throw new Error(
                    `${rel(packRoot, sourceFile)}: namespace-root defs are data-only (no display half)`
                );
            }
            if (!split.data) {
                throw new Error(
                    `${rel(packRoot, sourceFile)}: expected a data document`
                );
            }
            planWrite(
                path.join(roots.data, namespace, entry.name),
                split.data,
                sourceFile,
                "data"
            );
            continue;
        }

        if (!entry.isDirectory()) {
            throw new Error(
                `${rel(packRoot, path.join(defsNs, entry.name))}: unsupported definition entry`
            );
        }
        const dir = entry.name;

        if (isRegistryKind(dir)) {
            const registry = dir as RegistryKind;
            const registryRoot = path.join(defsNs, registry);
            for (const filename of listYamlFiles(registryRoot)) {
                const stem = rel(registryRoot, filename).replace(/\.ya?ml$/i, "");
                const dataStem = dataStemFrom(stem);
                const split = splitDefSource(readText(filename), filename);

                if (split.data !== null) {
                    planWrite(
                        path.join(
                            roots.data,
                            namespace,
                            registry,
                            `${dataStem}.yml`
                        ),
                        split.data,
                        filename,
                        "data"
                    );
                }

                if (split.display !== null) {
                    const modelRel = modelEmitPath(
                        registry,
                        stem,
                        split.directive.model
                    );
                    if (modelRel.includes("..") || path.isAbsolute(modelRel)) {
                        throw new Error(
                            `${rel(packRoot, filename)}: invalid @pack-gen model path "${modelRel}"`
                        );
                    }
                    planWrite(
                        path.join(roots.assets, namespace, modelRel),
                        split.display,
                        filename,
                        "display"
                    );
                }

                if (split.display === null && split.data === null) {
                    throw new Error(
                        `${rel(packRoot, filename)}: empty definition`
                    );
                }
            }
            continue;
        }

        if ((DATA_ONLY_DIRS as readonly string[]).includes(dir)) {
            const fromRoot = path.join(defsNs, dir);
            for (const filename of listYamlFiles(fromRoot)) {
                const relative = rel(fromRoot, filename);
                const split = splitDefSource(readText(filename), filename);
                if (split.display) {
                    throw new Error(
                        `${rel(packRoot, filename)}: ${dir} defs are data-only (no display half)`
                    );
                }
                if (!split.data) {
                    throw new Error(
                        `${rel(packRoot, filename)}: expected a data document`
                    );
                }
                planWrite(
                    path.join(roots.data, namespace, dir, relative),
                    split.data,
                    filename,
                    "data"
                );
            }
            continue;
        }

        throw new Error(
            `${rel(packRoot, path.join(defsNs, dir))}: unknown definition directory`
        );
    }

    // Assets-only models: defs/<ns>/models/** → assets/<ns>/models/**
    const modelsRoot = path.join(defsNs, "models");
    for (const filename of listYamlFiles(modelsRoot)) {
        const relative = rel(modelsRoot, filename);
        const split = splitDefSource(readText(filename), filename);
        if (split.display && split.data) {
            throw new Error(
                `${rel(packRoot, filename)}: models/ defs are display-only (no data half)`
            );
        }
        const body = split.display ?? split.data;
        if (!body) {
            throw new Error(
                `${rel(packRoot, filename)}: expected a model document`
            );
        }
        planWrite(
            path.join(roots.assets, namespace, "models", relative),
            body,
            filename,
            "display"
        );
    }

    // Client-only: defs/<ns>/client/** → assets/<ns>/**
    const clientRoot = path.join(defsNs, "client");
    for (const filename of listFiles(clientRoot)) {
        const relative = rel(clientRoot, filename);
        if (!/\.ya?ml$/i.test(filename)) {
            planWrite(
                path.join(roots.assets, namespace, relative),
                fs.readFileSync(filename),
                filename,
                "asset"
            );
            continue;
        }
        const split = splitDefSource(readText(filename), filename);
        if (split.display) {
            throw new Error(
                `${rel(packRoot, filename)}: client/ defs are single-doc (do not use ---)`
            );
        }
        if (!split.data) {
            throw new Error(`${rel(packRoot, filename)}: expected a document`);
        }
        planWrite(
            path.join(roots.assets, namespace, relative),
            split.data,
            filename,
            "display"
        );
    }

    return planned;
}

function generateNamespace(
    packRoot: string,
    namespace: string,
    check: boolean
): GenerateResult {
    const roots = packRoots(packRoot);
    const planned = planNamespace(packRoot, namespace);
    const wrote: string[] = [];
    const removed: string[] = [];
    const plannedPaths = new Set(planned.map((entry) => entry.filename));

    if (check) {
        let dirty = false;
        for (const entry of planned) {
            if (
                !fs.existsSync(entry.filename) ||
                !sameContent(entry.filename, entry.content)
            ) {
                dirty = true;
                break;
            }
        }
        if (!dirty) {
            for (const file of managedFiles(roots, namespace)) {
                if (!plannedPaths.has(file)) {
                    dirty = true;
                    break;
                }
            }
        }
        return { wrote, removed, unchanged: !dirty };
    }

    const existing = managedFiles(roots, namespace);
    const previous = new Map(
        planned.map((entry) => [
            entry.filename,
            fs.existsSync(entry.filename)
                ? typeof entry.content === "string"
                    ? readText(entry.filename)
                    : fs.readFileSync(entry.filename)
                : null,
        ])
    );
    removed.push(...existing.filter((filename) => !plannedPaths.has(filename)));
    clearManagedFiles(roots, namespace);
    for (const entry of planned) {
        if (typeof entry.content === "string") {
            writeText(entry.filename, entry.content);
        } else {
            fs.mkdirSync(path.dirname(entry.filename), { recursive: true });
            fs.writeFileSync(entry.filename, entry.content);
        }
        if (!contentEquals(previous.get(entry.filename), entry.content)) {
            wrote.push(entry.filename);
        }
    }

    return {
        wrote,
        removed,
        unchanged: wrote.length === 0 && removed.length === 0,
    };
}

export function generatePack(options: GenerateOptions): GenerateResult {
    const roots = packRoots(options.packRoot);
    if (!fs.existsSync(roots.defs)) {
        return { wrote: [], removed: [], unchanged: true };
    }

    const wrote: string[] = [];
    const removed: string[] = [];
    let unchanged = true;

    const sourceManifest = path.join(options.packRoot, "pack.yml");
    const outputManifest = path.join(roots.output, "pack.yml");
    const manifestContent = readText(sourceManifest);
    if (!sameContent(outputManifest, manifestContent)) {
        unchanged = false;
        if (!options.check) {
            writeText(outputManifest, manifestContent);
            wrote.push(outputManifest);
        }
    }

    for (const entry of fs.readdirSync(roots.defs, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const result = generateNamespace(
            options.packRoot,
            entry.name,
            options.check === true
        );
        wrote.push(...result.wrote);
        removed.push(...result.removed);
        if (!result.unchanged) unchanged = false;
    }

    return { wrote, removed, unchanged };
}

export function planAuthoredSource(
    packRoot: string,
    filename: string
): ExplainResult {
    const roots = packRoots(packRoot);
    const relative = rel(roots.defs, filename);
    const parts = relative.split("/");
    const namespace = parts[0];
    if (
        !namespace ||
        parts.length < 2 ||
        relative === ".." ||
        relative.startsWith("../") ||
        path.isAbsolute(relative)
    ) {
        throw new Error("authored path must be inside defs/<namespace>/");
    }

    const source = `defs/${relative}`;
    const entries = planNamespace(packRoot, namespace).filter(
        (entry) => entry.source === source
    );
    if (entries.length === 0) {
        throw new Error(`${source}: unsupported authored source`);
    }
    const destinations = entries
        .filter(
            (
                entry
            ): entry is Planned & { role: GeneratedDocumentRole } =>
                entry.role !== "asset"
        )
        .map((entry) => ({
            role: entry.role,
            path: rel(roots.output, entry.filename),
        }))
        .sort(
            (left, right) =>
                (left.role === "display" ? 0 : 1) -
                    (right.role === "display" ? 0 : 1) ||
                left.path.localeCompare(right.path)
        );
    const documents = destinations.map((entry) => entry.role);
    return { source, documents, destinations };
}

export function discoverPacks(packsRoot: string): string[] {
    if (!fs.existsSync(packsRoot)) return [];
    return fs
        .readdirSync(packsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(packsRoot, entry.name))
        .filter((dir) => fs.existsSync(path.join(dir, "pack.yml")))
        .sort((left, right) => left.localeCompare(right));
}
