/**
 * Strip redundant id: / extends: none / inferred abstract: from defs display halves.
 * Path owns identity; loader applies defaults.
 *
 * bun run scripts/pack-gen/strip-model-boilerplate.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
    defaultModelExtends,
    isInferredAbstractPath,
    modelIdFromModelsPath,
    parseModelId,
} from "../../packages/shared/src/models/ids";
import {
    joinDefSource,
    listYamlFiles,
    readText,
    splitDefSource,
    writeText,
    isRegistryKind,
    type RegistryKind,
    defaultModelPath,
} from "./shared";

const DEFS = path.join(import.meta.dirname, "../../packs/bundu/defs/bundu");
const NS = "bundu";

function rel(from: string, filename: string): string {
    return path.relative(from, filename).replaceAll("\\", "/");
}

function stripDisplay(
    display: string,
    modelsRel: string,
    options?: { keepId?: boolean }
): string {
    const abstract =
        isInferredAbstractPath(modelsRel) ||
        /^\s*abstract:\s*true\s*$/m.test(display);
    const derived = modelIdFromModelsPath(NS, modelsRel, { abstract });
    const parts = parseModelId(derived);
    const defaultExtends = parts
        ? defaultModelExtends(parts.kind, parts.namespace, parts.path)
        : undefined;

    const authoredId = /^id:\s*(.+?)\s*$/m.exec(display)?.[1]?.trim();
    const authoredExtends = /^extends:\s*(.+?)\s*$/m.exec(display)?.[1]?.trim();
    const hasAbstract = /^\s*abstract:\s*true\s*$/m.test(display);
    const inferredAbstract = isInferredAbstractPath(modelsRel);

    let next = display;

    // Drop id when it matches path derivation (keep overrides like forest_tree).
    if (
        !options?.keepId &&
        authoredId &&
        (authoredId === derived || authoredId === `"${derived}"`)
    ) {
        next = next.replace(/^id:\s*.+\n?/m, "");
    }

    // Drop default extends (item → item_type:none).
    if (
        defaultExtends &&
        authoredExtends &&
        (authoredExtends === defaultExtends ||
            authoredExtends === `"${defaultExtends}"`)
    ) {
        next = next.replace(/^extends:\s*.+\n?/m, "");
    }

    // Drop abstract when folder already implies it.
    if (inferredAbstract && hasAbstract) {
        next = next.replace(/^abstract:\s*true\s*\n?/m, "");
    }

    // Trim leading blank lines left by removals.
    next = next.replace(/^\n+/, "").replace(/\n+$/, "");
    return next;
}

function modelsRelForPaired(
    registry: RegistryKind,
    stem: string,
    directiveModel?: string
): string {
    if (directiveModel?.startsWith("models/")) {
        return directiveModel.slice("models/".length);
    }
    if (registry === "buildings" && stem.includes("/")) {
        return `${stem}.yml`;
    }
    const dataStem = stem.includes("/")
        ? stem.slice(stem.lastIndexOf("/") + 1)
        : stem;
    return defaultModelPath(registry, dataStem).replace(/^models\//, "");
}

let stripped = 0;

// Paired registries + item_types
for (const entry of fs.readdirSync(DEFS, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = entry.name;

    if (dir === "item_types") {
        const root = path.join(DEFS, dir);
        for (const filename of listYamlFiles(root)) {
            const stem = rel(root, filename).replace(/\.ya?ml$/i, "");
            const split = splitDefSource(readText(filename), filename);
            const modelsRel = `items/type/${stem}.yml`;
            if (split.display) {
                const display = stripDisplay(split.display, modelsRel);
                writeText(
                    filename,
                    joinDefSource({
                        display: display.length > 0 ? display : null,
                        data: split.data,
                    })
                );
                stripped += 1;
            } else if (split.data && looksLikeModel(split.data)) {
                const display = stripDisplay(split.data, modelsRel);
                writeText(filename, joinDefSource({ display }));
                stripped += 1;
            }
        }
        continue;
    }

    if (dir === "models") {
        const root = path.join(DEFS, dir);
        for (const filename of listYamlFiles(root)) {
            const modelsRel = rel(root, filename);
            const split = splitDefSource(readText(filename), filename);
            const body = split.display ?? split.data;
            if (!body) continue;
            const display = stripDisplay(body, modelsRel);
            writeText(filename, joinDefSource({ display }));
            stripped += 1;
        }
        continue;
    }

    if (!isRegistryKind(dir)) continue;
    const registry = dir as RegistryKind;
    const root = path.join(DEFS, dir);
    for (const filename of listYamlFiles(root)) {
        const stem = rel(root, filename).replace(/\.ya?ml$/i, "");
        const split = splitDefSource(readText(filename), filename);
        if (!split.display) continue;
        const modelsRel = modelsRelForPaired(
            registry,
            stem,
            split.directive.model
        );
        // Keep explicit id when path can't derive the right one (nature/tree).
        const keepId =
            modelsRel.startsWith("nature/") ||
            (split.directive.model !== undefined &&
                !modelsRel.endsWith(
                    `${stem.includes("/") ? stem.slice(stem.lastIndexOf("/") + 1) : stem}.yml`
                ));
        // forest_tree: modelsRel is nature/tree.yml, derived would be model:bundu:tree
        // but authored id is resource:bundu:forest_tree — keepId true via nature/
        const display = stripDisplay(split.display, modelsRel, { keepId });
        writeText(
            filename,
            joinDefSource({
                directive: split.directive.model
                    ? { model: split.directive.model }
                    : undefined,
                display,
                data: split.data,
            })
        );
        stripped += 1;
    }
}

function looksLikeModel(yaml: string): boolean {
    return (
        /^id:/m.test(yaml) ||
        /^abstract:/m.test(yaml) ||
        /^displays:/m.test(yaml) ||
        /^texture:/m.test(yaml) ||
        /^parts:/m.test(yaml)
    );
}

console.log(`Stripped boilerplate from ${stripped} def files`);
