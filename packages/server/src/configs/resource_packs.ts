import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { packs } from "./packs";

export type ResourceAsset = {
    path: string;
    hash: string;
    size: number;
};

export type ResourcePackManifest = {
    format: 1;
    fingerprint: string;
    packs: {
        id: string;
        version: string;
        format: number;
        hash: string;
    }[];
    visuals: { hash: string; url: string };
    assets: ResourceAsset[];
};

type ServedAsset = ResourceAsset & { filename: string };

function hash(data: string | Uint8Array): string {
    return createHash("sha256").update(data).digest("hex");
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

/** Hash pack.yml + assets/ only — data/ edits must not force visual renegotiation. */
function hashPackResourceInputs(packDirectory: string): string {
    const digest = createHash("sha256");
    const packYml = path.join(packDirectory, "pack.yml");
    const packContent = fs.readFileSync(packYml);
    digest.update(`pack.yml:${packContent.length}:`);
    digest.update(packContent);

    const assetsDirectory = path.join(packDirectory, "assets");
    for (const filename of files(assetsDirectory)) {
        const relative = path
            .relative(assetsDirectory, filename)
            .replaceAll("\\", "/");
        const content = fs.readFileSync(filename);
        digest.update(`${relative.length}:${relative}:${content.length}:`);
        digest.update(content);
    }
    return digest.digest("hex");
}

function record(value: unknown, source: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source}: expected an object`);
    }
    return value as Record<string, unknown>;
}

export class ResourcePackService {
    readonly manifest: ResourcePackManifest;
    readonly visualsJson: string;
    private readonly servedAssets = new Map<string, ServedAsset>();

    constructor() {
        const visuals: Record<string, unknown> = {};

        for (const pack of packs.packs) {
            const assetsRoot = path.join(pack.directory, "assets");
            for (const namespaceEntry of fs.existsSync(assetsRoot)
                ? fs
                      .readdirSync(assetsRoot, { withFileTypes: true })
                      .sort((left, right) => left.name.localeCompare(right.name))
                : []) {
                if (!namespaceEntry.isDirectory()) continue;
                const namespace = namespaceEntry.name;
                const namespaceRoot = path.join(assetsRoot, namespace);

                const texturesRoot = path.join(namespaceRoot, "textures");
                for (const filename of files(texturesRoot)) {
                    const relative = path
                        .relative(texturesRoot, filename)
                        .replaceAll("\\", "/");
                    const logicalPath = `${namespace}/${relative}`;
                    const content = fs.readFileSync(filename);
                    this.servedAssets.set(logicalPath, {
                        path: logicalPath,
                        hash: hash(content),
                        size: content.length,
                        filename,
                    });
                }

                const visualsRoot = path.join(namespaceRoot, "visuals");
                for (const filename of files(visualsRoot).filter((name) =>
                    /\.ya?ml$/i.test(name)
                )) {
                    const document = record(
                        Bun.YAML.parse(fs.readFileSync(filename, "utf8")),
                        filename
                    );
                    if ("id" in document) {
                        if (typeof document.id !== "string" || !document.id) {
                            throw new Error(
                                `${filename}.id: expected a non-empty string`
                            );
                        }
                        visuals[document.id] = document;
                    } else {
                        Object.assign(visuals, document);
                    }
                }
            }
        }

        this.visualsJson = JSON.stringify({ stack: visuals });
        const visualsHash = hash(this.visualsJson);
        const assets = [...this.servedAssets.values()]
            .map(({ filename: _filename, ...asset }) => asset)
            .sort((left, right) => left.path.localeCompare(right.path));
        const packEntries = packs.packs.map((pack) => ({
            id: pack.manifest.id,
            version: pack.manifest.version,
            format: pack.manifest.format,
            hash: hashPackResourceInputs(pack.directory),
        }));
        const fingerprint = hash(
            JSON.stringify({ format: 1, packs: packEntries, visualsHash, assets })
        );

        this.manifest = {
            format: 1,
            fingerprint,
            packs: packEntries,
            visuals: { hash: visualsHash, url: "/packs/visuals.json" },
            assets,
        };
    }

    asset(logicalPath: string): ServedAsset | undefined {
        return this.servedAssets.get(logicalPath);
    }
}

export const resourcePacks = new ResourcePackService();
