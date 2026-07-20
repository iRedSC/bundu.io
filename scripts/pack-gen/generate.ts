import fs from "node:fs";
import path from "node:path";
import {
    DATA_ONLY_DIRS,
    defaultModelPath,
    isRegistryKind,
    listYamlFiles,
    packRoots,
    readText,
    rimrafYamlTree,
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

function rel(from: string, filename: string): string {
    return path.relative(from, filename).replaceAll("\\", "/");
}

function ensureSame(text: string): string {
    return text.endsWith("\n") ? text : `${text}\n`;
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

function managedYamlFiles(
    roots: ReturnType<typeof packRoots>,
    namespace: string
): string[] {
    const files = [
        ...listYamlFiles(path.join(roots.data, namespace)),
        ...listYamlFiles(path.join(roots.assets, namespace, "models")),
        ...listYamlFiles(path.join(roots.assets, namespace, "ground_models")),
        ...listYamlFiles(path.join(roots.assets, namespace, "lang")),
    ];
    for (const name of ["gameplay.yml", "stat_bars.yml"]) {
        const file = path.join(roots.assets, namespace, name);
        if (fs.existsSync(file)) files.push(file);
    }
    return files.sort((left, right) => left.localeCompare(right));
}

function clearManagedYaml(
    roots: ReturnType<typeof packRoots>,
    namespace: string
): string[] {
    const removed = managedYamlFiles(roots, namespace);
    for (const filename of removed) {
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
    }
    for (const root of [
        path.join(roots.data, namespace),
        path.join(roots.assets, namespace, "models"),
        path.join(roots.assets, namespace, "ground_models"),
        path.join(roots.assets, namespace, "lang"),
    ]) {
        rimrafYamlTree(root);
    }
    return removed;
}

function generateNamespace(
    packRoot: string,
    namespace: string,
    check: boolean
): GenerateResult {
    const roots = packRoots(packRoot);
    const defsNs = path.join(roots.defs, namespace);
    const wrote: string[] = [];
    const removed: string[] = [];

    type Planned = { filename: string; content: string };
    const planned: Planned[] = [];
    const planWrite = (filename: string, content: string) => {
        planned.push({ filename, content: ensureSame(content) });
    };

    for (const entry of fs.readdirSync(defsNs, { withFileTypes: true })) {
        if (entry.name === "models" || entry.name === "client") continue;

        if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
            const sourceFile = path.join(defsNs, entry.name);
            const split = splitDefSource(readText(sourceFile), sourceFile);
            if (split.display) {
                throw new Error(
                    `${sourceFile}: namespace-root defs are data-only (no display half)`
                );
            }
            if (!split.data) {
                throw new Error(`${sourceFile}: expected a data document`);
            }
            planWrite(path.join(roots.data, namespace, entry.name), split.data);
            continue;
        }

        if (!entry.isDirectory()) continue;
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
                        split.data
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
                            `${filename}: invalid @pack-gen model path "${modelRel}"`
                        );
                    }
                    planWrite(
                        path.join(roots.assets, namespace, modelRel),
                        split.display
                    );
                }

                if (split.display === null && split.data === null) {
                    throw new Error(`${filename}: empty definition`);
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
                        `${filename}: ${dir} defs are data-only (no display half)`
                    );
                }
                if (!split.data) {
                    throw new Error(`${filename}: expected a data document`);
                }
                planWrite(
                    path.join(roots.data, namespace, dir, relative),
                    split.data
                );
            }
        }
    }

    // Assets-only models: defs/<ns>/models/** → assets/<ns>/models/**
    const modelsRoot = path.join(defsNs, "models");
    for (const filename of listYamlFiles(modelsRoot)) {
        const relative = rel(modelsRoot, filename);
        const split = splitDefSource(readText(filename), filename);
        if (split.display && split.data) {
            throw new Error(
                `${filename}: models/ defs are display-only (no data half)`
            );
        }
        const body = split.display ?? split.data;
        if (!body) throw new Error(`${filename}: expected a model document`);
        planWrite(path.join(roots.assets, namespace, "models", relative), body);
    }

    // Client-only: defs/<ns>/client/** → assets/<ns>/**
    const clientRoot = path.join(defsNs, "client");
    for (const filename of listYamlFiles(clientRoot)) {
        const relative = rel(clientRoot, filename);
        const split = splitDefSource(readText(filename), filename);
        if (split.display) {
            throw new Error(
                `${filename}: client/ defs are single-doc (do not use ---)`
            );
        }
        if (!split.data) throw new Error(`${filename}: expected a document`);
        planWrite(path.join(roots.assets, namespace, relative), split.data);
    }

    const plannedPaths = new Set(planned.map((entry) => entry.filename));

    if (check) {
        let dirty = false;
        for (const entry of planned) {
            if (
                !fs.existsSync(entry.filename) ||
                readText(entry.filename) !== entry.content
            ) {
                dirty = true;
                break;
            }
        }
        if (!dirty) {
            for (const file of managedYamlFiles(roots, namespace)) {
                if (!plannedPaths.has(file)) {
                    dirty = true;
                    break;
                }
            }
        }
        return { wrote, removed, unchanged: !dirty };
    }

    removed.push(...clearManagedYaml(roots, namespace));
    for (const entry of planned) {
        const prev = fs.existsSync(entry.filename)
            ? readText(entry.filename)
            : null;
        writeText(entry.filename, entry.content);
        if (prev !== entry.content) wrote.push(entry.filename);
    }

    return {
        wrote,
        removed,
        unchanged: wrote.length === 0,
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

export function discoverPacks(packsRoot: string): string[] {
    if (!fs.existsSync(packsRoot)) return [];
    return fs
        .readdirSync(packsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(packsRoot, entry.name))
        .filter((dir) => fs.existsSync(path.join(dir, "pack.yml")))
        .sort((left, right) => left.localeCompare(right));
}
