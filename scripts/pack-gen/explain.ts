import fs from "node:fs";
import path from "node:path";
import {
    type ExplainResult,
    planAuthoredSource,
} from "./generate";

const MAX_DIAGNOSTIC_LENGTH = 500;

function inside(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return (
        relative !== "" &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
    );
}

function findPackRoot(filename: string): string | null {
    let directory = path.dirname(filename);
    while (true) {
        if (
            fs.existsSync(path.join(directory, "pack.yml")) &&
            inside(path.join(directory, "defs"), filename)
        ) {
            return directory;
        }
        const parent = path.dirname(directory);
        if (parent === directory) return null;
        directory = parent;
    }
}

export function explainAuthoredPath(authoredPath: string): ExplainResult {
    const filename = path.resolve(authoredPath);
    const packRoot = findPackRoot(filename);
    if (!packRoot) {
        throw new Error(
            "authored path must be inside a pack's defs/ directory"
        );
    }
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
        throw new Error("authored path must identify an existing file");
    }

    try {
        return planAuthoredSource(packRoot, filename);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const relativeMessage = message.replaceAll(
            `${packRoot}${path.sep}`,
            ""
        );
        throw new Error(relativeMessage.slice(0, MAX_DIAGNOSTIC_LENGTH));
    }
}
