/**
 * One-shot: rewrite defs model ids to kind:namespace:path, split item_types,
 * and update item `type:` refs to bundu:path.
 *
 * Run: bun run scripts/pack-gen/migrate-model-ids.ts
 * Then: bun run pack:gen && bun run validate:packs
 */
import fs from "node:fs";
import path from "node:path";
import {
    modelId,
    modelIdFromModelsPath,
    type ModelKind,
} from "../../packages/shared/src/models/ids";
import {
    joinDefSource,
    listYamlFiles,
    readText,
    splitDefSource,
    writeText,
} from "./shared";

const PACK = path.join(import.meta.dirname, "../../packs/bundu");
const DEFS = path.join(PACK, "defs/bundu");
const NS = "bundu";

function rel(from: string, filename: string): string {
    return path.relative(from, filename).replaceAll("\\", "/");
}

function isAbstract(yaml: string): boolean {
    return /^\s*abstract:\s*true\s*$/m.test(yaml);
}

function rewriteYamlRefs(
    yaml: string,
    map: Map<string, string>,
    filename: string
): string {
    let text = yaml;
    // id: / extends: top-level-ish keys (also nested model: under displays)
    text = text.replace(
        /^(\s*(?:id|extends|model):\s*)(.+?)\s*$/gm,
        (full, prefix: string, value: string) => {
            const trimmed = value.replace(/^["']|["']$/g, "");
            // ground_type data `model: grass` is a ground-model stem — skip when
            // this file is a ground_types def (handled by caller via map miss).
            const next = map.get(trimmed);
            if (!next) return full;
            return `${prefix}${next}`;
        }
    );
    // Sanity: leftover old-style item/ ids
    if (/(?:^|\s)id:\s*item\//m.test(text) || /extends:\s*item\//m.test(text)) {
        console.warn(`warning: possible unmigrated ref in ${filename}`);
    }
    return text;
}

type ModelSource = {
    filename: string;
    /** Old authored id */
    oldId: string;
    newId: string;
    display: string;
    /** If this display lives inside a paired def, the data half */
    data: string | null;
    /** How to write back */
    kind: "paired" | "models" | "item_types_merge";
};

function parseIdField(yaml: string): string | null {
    const match = /^id:\s*(.+?)\s*$/m.exec(yaml);
    return match?.[1]?.replace(/^["']|["']$/g, "") ?? null;
}

function collect(): { sources: ModelSource[]; idMap: Map<string, string> } {
    const sources: ModelSource[] = [];
    const idMap = new Map<string, string>();

    const add = (
        filename: string,
        display: string,
        data: string | null,
        modelsRel: string | null,
        kind: ModelSource["kind"],
        forcedNewId?: string
    ) => {
        const oldId = parseIdField(display);
        if (!oldId) {
            throw new Error(`${filename}: display half missing id:`);
        }
        const abstract = isAbstract(display);
        let newId =
            forcedNewId ??
            (modelsRel
                ? modelIdFromModelsPath(NS, modelsRel, { abstract })
                : null);
        if (!newId) throw new Error(`${filename}: could not derive new id`);

        // nature/tree.yml authored as forest_tree
        if (oldId === "forest_tree") {
            newId = modelId("resource", NS, "forest_tree");
        }

        sources.push({ filename, oldId, newId, display, data, kind });
        if (idMap.has(oldId) && idMap.get(oldId) !== newId) {
            throw new Error(
                `Conflict for old id "${oldId}": ${idMap.get(oldId)} vs ${newId}`
            );
        }
        idMap.set(oldId, newId);
    };

    // Paired registry defs with display halves
    const paired: Array<{ dir: string; modelsRel: (stem: string) => string }> = [
        { dir: "items", modelsRel: (s) => `items/${s}.yml` },
        { dir: "entities", modelsRel: (s) => `actors/${s}.yml` },
        { dir: "decorations", modelsRel: (s) => `decorations/${s}.yml` },
        { dir: "resources", modelsRel: (s) => `resources/${s}.yml` },
        {
            dir: "buildings",
            modelsRel: (s) => {
                // stem may be walls/wood_wall
                return `models-placeholder`;
            },
        },
    ];

    for (const { dir, modelsRel } of paired) {
        const root = path.join(DEFS, dir);
        for (const filename of listYamlFiles(root)) {
            const stem = rel(root, filename).replace(/\.ya?ml$/i, "");
            const split = splitDefSource(readText(filename), filename);
            if (!split.display) continue;

            let modelsPath: string;
            if (dir === "buildings") {
                modelsPath = stem.includes("/")
                    ? `${stem}.yml`
                    : `structures/${stem}.yml`;
            } else if (dir === "resources") {
                // May have @pack-gen model= override
                const modelOverride = split.directive.model;
                if (modelOverride?.startsWith("models/")) {
                    modelsPath = modelOverride.slice("models/".length);
                } else {
                    modelsPath = modelsRel(stem);
                }
            } else {
                modelsPath = modelsRel(stem);
            }

            add(filename, split.display, split.data, modelsPath, "paired");
        }
    }

    // Assets-only under models/
    const modelsRoot = path.join(DEFS, "models");
    for (const filename of listYamlFiles(modelsRoot)) {
        const modelsPath = rel(modelsRoot, filename);
        // Skip items/type — merged into item_types below
        if (modelsPath.startsWith("items/type/")) continue;
        const split = splitDefSource(readText(filename), filename);
        const body = split.display ?? split.data;
        if (!body) throw new Error(`${filename}: empty`);
        add(filename, body, null, modelsPath, "models");
    }

    // item type abstracts (models/items/type) — recorded for merge
    const typeRoot = path.join(modelsRoot, "items/type");
    for (const filename of listYamlFiles(typeRoot)) {
        const stem = rel(typeRoot, filename).replace(/\.ya?ml$/i, "");
        const body = readText(filename).replace(/\n+$/, "");
        add(
            filename,
            body,
            null,
            `items/type/${stem}.yml`,
            "item_types_merge"
        );
    }

    return { sources, idMap };
}

function splitItemTypes(idMap: Map<string, string>): void {
    const monolith = path.join(DEFS, "item_types.yml");
    const raw = Bun.YAML.parse(readText(monolith));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("item_types.yml: expected a map");
    }
    const types = raw as Record<string, unknown>;
    const typeModels = new Map<string, string>();
    const typeRoot = path.join(DEFS, "models/items/type");
    for (const filename of listYamlFiles(typeRoot)) {
        const stem = rel(typeRoot, filename).replace(/\.ya?ml$/i, "");
        typeModels.set(stem, readText(filename).replace(/\n+$/, ""));
    }

    const outDir = path.join(DEFS, "item_types");
    fs.mkdirSync(outDir, { recursive: true });

    const allStems = new Set([
        ...Object.keys(types),
        ...typeModels.keys(),
    ]);

    for (const stem of [...allStems].sort()) {
        const dataObj = types[stem];
        const displayRaw = typeModels.get(stem) ?? null;
        let display = displayRaw;
        if (display) {
            display = rewriteYamlRefs(display, idMap, `item_types/${stem}`);
            // Ensure id is new form
            const newId = modelId("item_type", NS, stem);
            display = display.replace(/^id:\s*.+$/m, `id: ${newId}`);
            display = display.replace(
                /^extends:\s*.+$/m,
                (line) => {
                    const v = line.replace(/^extends:\s*/, "").trim();
                    const mapped = idMap.get(v);
                    return mapped ? `extends: ${mapped}` : line;
                }
            );
        }
        const dataYaml =
            dataObj === undefined
                ? null
                : Bun.YAML.stringify(dataObj).replace(/\n+$/, "");

        const out = path.join(outDir, `${stem}.yml`);
        if (display && dataYaml !== null) {
            writeText(out, joinDefSource({ display, data: dataYaml }));
        } else if (display) {
            writeText(out, joinDefSource({ display }));
        } else if (dataYaml !== null) {
            writeText(out, joinDefSource({ data: dataYaml }));
        }
    }

    fs.unlinkSync(monolith);
    // Remove old type models (now under item_types/)
    for (const filename of listYamlFiles(typeRoot)) {
        fs.unlinkSync(filename);
    }
}

function updateItemTypeRefs(): void {
    const itemsRoot = path.join(DEFS, "items");
    for (const filename of listYamlFiles(itemsRoot)) {
        const text = readText(filename);
        const next = text.replace(
            /^type:\s*([a-z_][a-z0-9_]*)\s*$/gm,
            (_full, typeName: string) => `type: ${NS}:${typeName}`
        );
        if (next !== text) writeText(filename, next);
    }
}

function main(): void {
    const { sources, idMap } = collect();
    console.log(`Collected ${sources.length} models, ${idMap.size} id mappings`);

    // Write back paired + models (not item_types_merge — handled in split)
    for (const source of sources) {
        if (source.kind === "item_types_merge") continue;
        let display = rewriteYamlRefs(source.display, idMap, source.filename);
        display = display.replace(/^id:\s*.+$/m, `id: ${source.newId}`);
        if (source.kind === "paired") {
            const existing = splitDefSource(
                readText(source.filename),
                source.filename
            );
            writeText(
                source.filename,
                joinDefSource({
                    directive: existing.directive.model
                        ? { model: existing.directive.model }
                        : undefined,
                    display,
                    data: source.data,
                })
            );
        } else {
            writeText(source.filename, joinDefSource({ display }));
        }
    }

    splitItemTypes(idMap);
    updateItemTypeRefs();

    // Print sample mappings
    const samples = [
        "item/wood_sword",
        "item/type/sword",
        "decoration/pine_tree",
        "wood_wall",
        "bear",
        "animal",
        "forest_tree",
        "wall",
        "single_tile_node",
        "player",
        "structure",
    ];
    for (const old of samples) {
        console.log(`  ${old} → ${idMap.get(old) ?? "MISSING"}`);
    }
}

main();
