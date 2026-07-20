import fs from "node:fs";
import path from "node:path";

export const DOC_SEPARATOR = "\n---\n";
export const DIRECTIVE_PREFIX = "# @pack-gen ";

export type RegistryKind =
    | "items"
    | "entities"
    | "decorations"
    | "resources"
    | "buildings"
    | "ground_types";

export const PAIRED_REGISTRIES: readonly RegistryKind[] = [
    "items",
    "entities",
    "decorations",
    "resources",
    "buildings",
    "ground_types",
] as const;

export const DATA_ONLY_DIRS = [
    "recipes",
    "loot_tables",
    "tags",
] as const;

/** Default assets-relative model path for a paired registry stem. */
export function defaultModelPath(registry: RegistryKind, stem: string): string {
    switch (registry) {
        case "items":
            return `models/items/${stem}.yml`;
        case "entities":
            return `models/actors/${stem}.yml`;
        case "decorations":
            return `models/decorations/${stem}.yml`;
        case "resources":
            return `models/resources/${stem}.yml`;
        case "buildings":
            return `models/structures/${stem}.yml`;
        case "ground_types":
            return `ground_models/${stem}.yml`;
    }
}

export function dataPath(registry: RegistryKind, stem: string): string {
    return `${registry}/${stem}.yml`;
}

export function listFiles(directory: string): string[] {
    if (!fs.existsSync(directory)) return [];
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const filename = path.join(directory, entry.name);
            return entry.isDirectory() ? listFiles(filename) : [filename];
        })
        .sort((left, right) => left.localeCompare(right));
}

export function listYamlFiles(directory: string): string[] {
    return listFiles(directory).filter((filename) => /\.ya?ml$/i.test(filename));
}

export function ensureTrailingNewline(text: string): string {
    return text.endsWith("\n") ? text : `${text}\n`;
}

export function readText(filename: string): string {
    return fs.readFileSync(filename, "utf8");
}

export function writeText(filename: string, text: string): void {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, ensureTrailingNewline(text));
}

export function rimrafYamlTree(root: string): void {
    if (!fs.existsSync(root)) return;
    for (const filename of listYamlFiles(root)) {
        fs.unlinkSync(filename);
    }
    // Remove empty directories bottom-up.
    const dirs = listFiles(root)
        .map((filename) => path.dirname(filename))
        .concat(root)
        .filter((dir, index, all) => all.indexOf(dir) === index)
        .sort((left, right) => right.length - left.length);
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
}

export type PackGenDirective = {
    model?: string;
};

export function parseDirectiveLine(line: string): PackGenDirective | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith(DIRECTIVE_PREFIX.trim()) && !trimmed.startsWith("# @pack-gen")) {
        return null;
    }
    const body = trimmed.replace(/^#\s*@pack-gen\s+/, "");
    const directive: PackGenDirective = {};
    for (const part of body.split(/\s+/).filter(Boolean)) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        const key = part.slice(0, eq);
        const value = part.slice(eq + 1);
        if (key === "model") directive.model = value;
    }
    return directive;
}

export function formatDirective(directive: PackGenDirective): string {
    const parts: string[] = [];
    if (directive.model) parts.push(`model=${directive.model}`);
    return `${DIRECTIVE_PREFIX}${parts.join(" ")}`.trimEnd();
}

export type SplitDef = {
    directive: PackGenDirective;
    display: string | null;
    data: string | null;
};

/** Split an authored def into display/data halves. Preserves raw YAML text. */
export function splitDefSource(source: string, filename: string): SplitDef {
    const normalized = source.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    let directive: PackGenDirective = {};
    let start = 0;
    while (start < lines.length) {
        const line = lines[start] ?? "";
        if (line.trim() === "") {
            start += 1;
            continue;
        }
        const parsed = parseDirectiveLine(line);
        if (!parsed) break;
        directive = { ...directive, ...parsed };
        start += 1;
    }

    const body = lines.slice(start).join("\n");
    const parts = body.split(/^---\s*$/m);
    if (parts.length > 2) {
        throw new Error(
            `${filename}: expected at most one "---" document separator, found ${parts.length - 1}`
        );
    }

    const parsedDocs = Bun.YAML.parse(normalized.includes("---") ? normalized : body);
    // Bun returns an array for multi-doc; validate shape loosely.
    if (Array.isArray(parsedDocs) && parsedDocs.length > 2) {
        throw new Error(
            `${filename}: YAML parsed as ${parsedDocs.length} documents; max 2`
        );
    }

    if (parts.length === 1) {
        const single = (parts[0] ?? "").replace(/^\n+/, "").replace(/\n+$/, "");
        return { directive, display: null, data: single.length > 0 ? single : null };
    }

    const display = (parts[0] ?? "").replace(/^\n+/, "").replace(/\n+$/, "");
    const data = (parts[1] ?? "").replace(/^\n+/, "").replace(/\n+$/, "");
    return {
        directive,
        display: display.length > 0 ? display : null,
        data: data.length > 0 ? data : null,
    };
}

export function joinDefSource(options: {
    directive?: PackGenDirective;
    display?: string | null;
    data?: string | null;
}): string {
    const chunks: string[] = [];
    if (options.directive?.model) {
        chunks.push(formatDirective({ model: options.directive.model }));
    }
    const display =
        options.display === undefined || options.display === null
            ? null
            : options.display.replace(/\n+$/, "");
    const data =
        options.data === undefined || options.data === null
            ? null
            : options.data.replace(/\n+$/, "");
    if (display !== null && data !== null) {
        chunks.push(`${display}${DOC_SEPARATOR}${data}`);
    } else if (display !== null) {
        // Display-only single doc (models/, or unpaired visuals).
        chunks.push(display);
    } else if (data !== null) {
        chunks.push(data);
    } else {
        chunks.push("{}");
    }
    return ensureTrailingNewline(chunks.join("\n"));
}

export function isRegistryKind(value: string): value is RegistryKind {
    return (PAIRED_REGISTRIES as readonly string[]).includes(value);
}

export function packRoots(packRoot: string): {
    defs: string;
    data: string;
    assets: string;
} {
    return {
        defs: path.join(packRoot, "defs"),
        data: path.join(packRoot, "data"),
        assets: path.join(packRoot, "assets"),
    };
}
