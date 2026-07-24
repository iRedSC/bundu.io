import fs from "node:fs";
import path from "node:path";
import { PackStack } from "./packs";

export const PACK_DIAGNOSTIC_LIMIT = 50;
export const PACK_DIAGNOSTIC_MESSAGE_LIMIT = 400;

export type PackDiagnostic = {
    severity: "error";
    code:
        | "invalid-stack"
        | "malformed-resource"
        | "invalid-tag"
        | "resource-conflict";
    source: string;
    message: string;
};

export type PackValidationResult =
    | { ok: true; stack: PackStack; diagnostics: readonly [] }
    | { ok: false; diagnostics: readonly PackDiagnostic[]; omitted: number };

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

function source(root: string, filename?: string): string {
    if (!filename) return "pack stack";
    const relative = path.relative(root, filename).replaceAll("\\", "/");
    return relative.startsWith("../") ? "pack stack" : relative;
}

function boundedMessage(root: string, error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    const redacted = raw
        .replaceAll(root, "<pack-root>")
        .replaceAll(root.replaceAll("\\", "/"), "<pack-root>")
        .replace(/(?:[A-Za-z]:)?[/\\](?:[^/\s:\\]+[/\\]){2,}[^:\n]*/g, "<path>");
    return redacted.slice(0, PACK_DIAGNOSTIC_MESSAGE_LIMIT);
}

function diagnostic(
    root: string,
    code: PackDiagnostic["code"],
    error: unknown,
    filename?: string
): PackDiagnostic {
    return {
        severity: "error",
        code,
        source: source(root, filename),
        message: boundedMessage(root, error),
    };
}

function validateTag(
    root: string,
    filename: string,
    value: unknown
): PackDiagnostic[] {
    if (!filename.replaceAll("\\", "/").includes("/tags/")) return [];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [diagnostic(root, "invalid-tag", "expected an object", filename)];
    }
    const tag = value as Record<string, unknown>;
    if (
        !Array.isArray(tag.values) ||
        tag.values.some((entry) => typeof entry !== "string")
    ) {
        return [diagnostic(root, "invalid-tag", "values: expected a string array", filename)];
    }
    if (tag.replace !== undefined && typeof tag.replace !== "boolean") {
        return [diagnostic(root, "invalid-tag", "replace: expected a boolean", filename)];
    }
    if (tag.category !== undefined && typeof tag.category !== "boolean") {
        return [diagnostic(root, "invalid-tag", "category: expected a boolean", filename)];
    }
    return [];
}

function resourceDiagnostics(root: string, stack: PackStack): PackDiagnostic[] {
    const diagnostics: PackDiagnostic[] = [];
    const textures = new Map<string, string>();
    for (const pack of stack.packs) {
        for (const filename of files(pack.directory)) {
            if (/\.ya?ml$/i.test(filename)) {
                try {
                    const value = Bun.YAML.parse(fs.readFileSync(filename, "utf8"));
                    diagnostics.push(...validateTag(root, filename, value));
                } catch (error) {
                    diagnostics.push(diagnostic(root, "malformed-resource", error, filename));
                }
            }
            const normalized = filename.replaceAll("\\", "/");
            const marker = "/assets/";
            const textureMarker = "/textures/";
            const assetsAt = normalized.indexOf(marker);
            const texturesAt = normalized.indexOf(
                textureMarker,
                assetsAt + marker.length
            );
            if (assetsAt < 0 || texturesAt < 0) continue;
            const namespace = normalized.slice(assetsAt + marker.length, texturesAt);
            const relative = normalized.slice(texturesAt + textureMarker.length);
            const logical = `${namespace}/${relative.replace(/\.(?:svg|png)$/i, ".png")}`;
            const previous = textures.get(logical);
            if (previous) {
                diagnostics.push(
                    diagnostic(
                        root,
                        "resource-conflict",
                        `texture "${logical}" conflicts with ${source(root, previous)}`,
                        filename
                    )
                );
            } else {
                textures.set(logical, filename);
            }
        }
    }
    return diagnostics;
}

export function validatePackStack(root: string): PackValidationResult {
    const resolvedRoot = path.resolve(root);
    let stack: PackStack;
    try {
        stack = new PackStack(resolvedRoot);
    } catch (error) {
        return {
            ok: false,
            diagnostics: [diagnostic(resolvedRoot, "invalid-stack", error)],
            omitted: 0,
        };
    }
    const all = resourceDiagnostics(resolvedRoot, stack).sort(
        (left, right) =>
            left.source.localeCompare(right.source) ||
            left.code.localeCompare(right.code) ||
            left.message.localeCompare(right.message)
    );
    if (all.length === 0) return { ok: true, stack, diagnostics: [] };
    return {
        ok: false,
        diagnostics: all.slice(0, PACK_DIAGNOSTIC_LIMIT),
        omitted: Math.max(0, all.length - PACK_DIAGNOSTIC_LIMIT),
    };
}

export function assertValidPackStack(root: string): PackStack {
    const result = validatePackStack(root);
    if (result.ok) return result.stack;
    const details = result.diagnostics
        .map((entry) => `${entry.source}: ${entry.message}`)
        .join("\n");
    const omitted =
        result.omitted > 0
            ? `\n... ${result.omitted} more diagnostic(s)`
            : "";
    throw new Error(`Resource pack validation failed:\n${details}${omitted}`);
}
