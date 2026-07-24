import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type FingerprintAsset = {
    path: string;
    hash: string;
    size: number;
};

export type ResourceFingerprintInput = {
    packs: readonly {
        id: string;
        version: string;
        format: number;
        hash: string;
    }[];
    modelsHash: string;
    registriesHash: string;
    gameplayHash: string;
    statBarsHash: string;
    langHash: string;
    assets: readonly FingerprintAsset[];
};

export function sha256(data: string | Uint8Array): string {
    return createHash("sha256").update(data).digest("hex");
}

export function sortedFiles(directory: string): string[] {
    if (!fs.existsSync(directory)) return [];
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const filename = path.join(directory, entry.name);
            return entry.isDirectory() ? sortedFiles(filename) : [filename];
        })
        .sort((left, right) => left.localeCompare(right));
}

/** Hash pack.yml + assets/ only — data/ edits do not affect client resources. */
export function packResourceHash(packDirectory: string): string {
    const digest = createHash("sha256");
    const packYml = path.join(packDirectory, "pack.yml");
    const packContent = fs.readFileSync(packYml);
    digest.update(`pack.yml:${packContent.length}:`);
    digest.update(packContent);

    const assetsDirectory = path.join(packDirectory, "assets");
    for (const filename of sortedFiles(assetsDirectory)) {
        const relative = path
            .relative(assetsDirectory, filename)
            .replaceAll("\\", "/");
        const content = fs.readFileSync(filename);
        digest.update(`${relative.length}:${relative}:${content.length}:`);
        digest.update(content);
    }
    return digest.digest("hex");
}

export function resourcePackFingerprint(
    input: ResourceFingerprintInput
): string {
    return sha256(JSON.stringify({ format: 2, ...input }));
}
