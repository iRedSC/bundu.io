import fs from "node:fs";
import path from "node:path";
import {
    DATA_ONLY_DIRS,
    defaultModelPath,
    joinDefSource,
    listYamlFiles,
    packRoots,
    readText,
    writeText,
    type RegistryKind,
    PAIRED_REGISTRIES,
} from "./shared";

type ModelEntry = {
    absolute: string;
    /** Path relative to assets/<ns>/ */
    assetsRel: string;
    /** Path relative to assets/<ns>/models/ when under models/ */
    modelsRel: string | null;
    id: string | null;
    content: string;
};

function rel(from: string, filename: string): string {
    return path.relative(from, filename).replaceAll("\\", "/");
}

function parseModelId(content: string): string | null {
    const parsed = Bun.YAML.parse(content);
    const doc = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
    const id = (doc as Record<string, unknown>).id;
    return typeof id === "string" && id.length > 0 ? id : null;
}

function bareModelId(id: string): string {
    const slash = id.lastIndexOf("/");
    return slash === -1 ? id : id.slice(slash + 1);
}

function indexModels(assetsNs: string): {
    byAssetsRel: Map<string, ModelEntry>;
    byId: Map<string, ModelEntry>;
    byBareId: Map<string, ModelEntry[]>;
} {
    const byAssetsRel = new Map<string, ModelEntry>();
    const byId = new Map<string, ModelEntry>();
    const byBareId = new Map<string, ModelEntry[]>();

    const consider = (absolute: string, assetsRel: string, modelsRel: string | null) => {
        const content = readText(absolute);
        const entry: ModelEntry = {
            absolute,
            assetsRel,
            modelsRel,
            id: parseModelId(content),
            content,
        };
        byAssetsRel.set(assetsRel, entry);
        if (entry.id) {
            byId.set(entry.id, entry);
            const bare = bareModelId(entry.id);
            const list = byBareId.get(bare) ?? [];
            list.push(entry);
            byBareId.set(bare, list);
        }
    };

    for (const filename of listYamlFiles(path.join(assetsNs, "models"))) {
        const modelsRel = rel(path.join(assetsNs, "models"), filename);
        consider(filename, `models/${modelsRel}`, modelsRel);
    }
    for (const filename of listYamlFiles(path.join(assetsNs, "ground_models"))) {
        const groundRel = rel(path.join(assetsNs, "ground_models"), filename);
        consider(filename, `ground_models/${groundRel}`, null);
    }

    return { byAssetsRel, byId, byBareId };
}

function preferredModel(
    registry: RegistryKind,
    stem: string,
    index: ReturnType<typeof indexModels>
): ModelEntry | null {
    const defaultRel = defaultModelPath(registry, stem);
    const exact = index.byAssetsRel.get(defaultRel);
    if (exact) return exact;

    if (registry === "items") {
        return (
            index.byId.get(`item/${stem}`) ??
            index.byAssetsRel.get(`models/items/${stem}.yml`) ??
            null
        );
    }
    if (registry === "decorations") {
        return (
            index.byId.get(`decoration/${stem}`) ??
            index.byAssetsRel.get(`models/decorations/${stem}.yml`) ??
            null
        );
    }
    if (registry === "entities") {
        return (
            index.byId.get(stem) ??
            index.byAssetsRel.get(`models/actors/${stem}.yml`) ??
            null
        );
    }
    if (registry === "ground_types") {
        return index.byAssetsRel.get(`ground_models/${stem}.yml`) ?? null;
    }
    if (registry === "buildings") {
        for (const folder of ["walls", "doors", "structures"]) {
            const hit = index.byAssetsRel.get(`models/${folder}/${stem}.yml`);
            if (hit) return hit;
        }
        return index.byId.get(stem) ?? null;
    }
    if (registry === "resources") {
        const inResources = index.byAssetsRel.get(`models/resources/${stem}.yml`);
        if (inResources) return inResources;
        // e.g. forest_tree lives at models/nature/tree.yml with id: forest_tree
        const byId = index.byId.get(stem);
        if (byId) return byId;
        const bare = index.byBareId.get(stem) ?? [];
        return bare[0] ?? null;
    }
    return null;
}

function buildingDefsRel(model: ModelEntry, stem: string): string {
    // Prefer models/walls/wood_wall.yml → buildings/walls/wood_wall.yml
    if (model.modelsRel) {
        const dir = path.posix.dirname(model.modelsRel);
        if (dir !== ".") return `${dir}/${stem}.yml`;
    }
    return `${stem}.yml`;
}

function needsModelDirective(
    registry: RegistryKind,
    defsRelStem: string,
    model: ModelEntry
): string | undefined {
    if (registry === "buildings" && defsRelStem.includes("/")) {
        const expected = `models/${defsRelStem}.yml`;
        return model.assetsRel === expected ? undefined : model.assetsRel;
    }
    const dataStem = defsRelStem.includes("/")
        ? defsRelStem.slice(defsRelStem.lastIndexOf("/") + 1)
        : defsRelStem;
    const expected = defaultModelPath(registry, dataStem);
    return model.assetsRel === expected ? undefined : model.assetsRel;
}

export type MigrateResult = {
    wrote: string[];
    paired: number;
    dataOnly: number;
    assetsOnly: number;
};

export function migratePackToDefs(packRoot: string): MigrateResult {
    const roots = packRoots(packRoot);
    if (!fs.existsSync(roots.data)) {
        throw new Error(`${packRoot}: missing data/`);
    }
    if (!fs.existsSync(roots.assets)) {
        throw new Error(`${packRoot}: missing assets/`);
    }

    const wrote: string[] = [];
    let paired = 0;
    let dataOnly = 0;
    let assetsOnly = 0;
    const consumedModels = new Set<string>();

    const dataNamespaces = fs
        .readdirSync(roots.data, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));

    for (const namespace of dataNamespaces) {
        const dataNs = path.join(roots.data, namespace);
        const assetsNs = path.join(roots.assets, namespace);
        const defsNs = path.join(roots.defs, namespace);
        const models = indexModels(assetsNs);

        for (const registry of PAIRED_REGISTRIES) {
            const registryRoot = path.join(dataNs, registry);
            for (const filename of listYamlFiles(registryRoot)) {
                const stem = rel(registryRoot, filename).replace(/\.ya?ml$/i, "");
                const dataContent = readText(filename).replace(/\n+$/, "");
                const model = preferredModel(registry, stem, models);

                if (model) {
                    consumedModels.add(model.assetsRel);
                    const defsRel =
                        registry === "buildings"
                            ? buildingDefsRel(model, stem)
                            : `${stem}.yml`;
                    const directiveModel = needsModelDirective(
                        registry,
                        defsRel.replace(/\.ya?ml$/i, ""),
                        model
                    );
                    const out = path.join(defsNs, registry, defsRel);
                    writeText(
                        out,
                        joinDefSource({
                            directive: directiveModel
                                ? { model: directiveModel }
                                : undefined,
                            display: model.content.replace(/\n+$/, ""),
                            data: dataContent,
                        })
                    );
                    wrote.push(out);
                    paired += 1;
                } else {
                    const out = path.join(defsNs, registry, `${stem}.yml`);
                    writeText(
                        out,
                        joinDefSource({
                            data: dataContent,
                        })
                    );
                    wrote.push(out);
                    dataOnly += 1;
                }
            }
        }

        for (const dir of DATA_ONLY_DIRS) {
            const fromRoot = path.join(dataNs, dir);
            for (const filename of listYamlFiles(fromRoot)) {
                const relative = rel(fromRoot, filename);
                const out = path.join(defsNs, dir, relative);
                writeText(
                    out,
                    joinDefSource({
                        data: readText(filename).replace(/\n+$/, ""),
                    })
                );
                wrote.push(out);
                dataOnly += 1;
            }
        }

        for (const entry of fs.readdirSync(dataNs, { withFileTypes: true })) {
            if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
            const out = path.join(defsNs, entry.name);
            writeText(
                out,
                joinDefSource({
                    data: readText(path.join(dataNs, entry.name)).replace(
                        /\n+$/,
                        ""
                    ),
                })
            );
            wrote.push(out);
            dataOnly += 1;
        }

        // Remaining models → defs/<ns>/models/**
        for (const [assetsRel, model] of models.byAssetsRel) {
            if (consumedModels.has(assetsRel)) continue;
            if (!assetsRel.startsWith("models/")) {
                if (assetsRel.startsWith("ground_models/")) {
                    throw new Error(
                        `${packRoot}: ground model "${assetsRel}" has no matching data/${namespace}/ground_types entry`
                    );
                }
                continue;
            }
            const modelsRel = assetsRel.slice("models/".length);
            const out = path.join(defsNs, "models", modelsRel);
            writeText(
                out,
                joinDefSource({
                    display: model.content.replace(/\n+$/, ""),
                })
            );
            wrote.push(out);
            assetsOnly += 1;
        }

        // Client assets
        for (const name of ["gameplay.yml", "stat_bars.yml"]) {
            const from = path.join(assetsNs, name);
            if (!fs.existsSync(from)) continue;
            const out = path.join(defsNs, "client", name);
            writeText(
                out,
                joinDefSource({
                    data: readText(from).replace(/\n+$/, ""),
                })
            );
            wrote.push(out);
            assetsOnly += 1;
        }
        const langRoot = path.join(assetsNs, "lang");
        for (const filename of listYamlFiles(langRoot)) {
            const relative = rel(langRoot, filename);
            const out = path.join(defsNs, "client", "lang", relative);
            writeText(
                out,
                joinDefSource({
                    data: readText(filename).replace(/\n+$/, ""),
                })
            );
            wrote.push(out);
            assetsOnly += 1;
        }
    }

    return { wrote, paired, dataOnly, assetsOnly };
}
