import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { packs } from "./packs";
import type { ClientRegistryProjection } from "@bundu/shared/registry";
import { parseClientGameplayConfig } from "@bundu/shared/client_gameplay";
import {
    compileVisualDefs,
    type CompiledVisualDefs,
} from "@bundu/shared/visual/compile";
import type { CompiledVisualsPayload } from "@bundu/shared/visual/types";
import { rewritePackTextureRefs } from "@bundu/shared/visual/texture_paths";
import { BuildingConfigs } from "./loaders/buildings";
import { GroundTypeConfigs } from "./loaders/ground_types";
import { gameRegistries, registryProjection } from "./registries";
import {
    assertPackAssetBudget,
    sanitizePackTexture,
} from "./sanitize_pack_assets";

export type ResourceAsset = {
    path: string;
    hash: string;
    size: number;
};

export type ResourcePackManifest = {
    format: 2;
    fingerprint: string;
    packs: {
        id: string;
        version: string;
        format: number;
        hash: string;
    }[];
    visuals: { hash: string; url: string };
    registries: { hash: string; url: string };
    gameplay: { hash: string; url: string };
    assets: ResourceAsset[];
};

type ServedAsset = ResourceAsset & { bytes: Uint8Array };

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

function validateCompiledTextures(
    defs: CompiledVisualDefs,
    availableAssets: ReadonlySet<string>
): void {
    const validate = (texture: string, source: string) => {
        if (!availableAssets.has(texture)) {
            throw new Error(`${source}: missing texture "${texture}"`);
        }
    };
    for (const def of defs.values()) {
        if ("contexts" in def) {
            for (const [name, context] of Object.entries(def.contexts)) {
                if (context.texture) {
                    validate(context.texture, `${def.id}.contexts.${name}`);
                }
            }
            continue;
        }
        for (const part of def.parts) {
            if (part.sprite) validate(part.sprite, `${def.id}.parts.${part.name}`);
        }
        for (const [variant, parts] of Object.entries(def.variants ?? {})) {
            for (const [part, texture] of Object.entries(parts)) {
                validate(texture, `${def.id}.variants.${variant}.${part}`);
            }
        }
    }
}

export class ResourcePackService {
    readonly manifest: ResourcePackManifest;
    readonly visualsJson: string;
    readonly registriesJson: string;
    readonly gameplayJson: string;
    readonly compiledVisuals: CompiledVisualDefs;
    private readonly servedAssets = new Map<string, ServedAsset>();

    private constructor(
        manifest: ResourcePackManifest,
        visualsJson: string,
        registriesJson: string,
        gameplayJson: string,
        compiledVisuals: CompiledVisualDefs,
        servedAssets: Map<string, ServedAsset>
    ) {
        this.manifest = manifest;
        this.visualsJson = visualsJson;
        this.registriesJson = registriesJson;
        this.gameplayJson = gameplayJson;
        this.compiledVisuals = compiledVisuals;
        this.servedAssets = servedAssets;
    }

    /** Load, sanitize, and compile pack assets for hostile client delivery. */
    static async create(): Promise<ResourcePackService> {
        const visuals: Record<string, unknown> = {};
        const pendingTextures: { logicalPath: string; bytes: Uint8Array }[] =
            [];
        let clientGameplayRaw: unknown;

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

                const gameplayFile = path.join(namespaceRoot, "gameplay.yml");
                if (fs.existsSync(gameplayFile)) {
                    // Later packs replace the complete client gameplay document.
                    clientGameplayRaw = Bun.YAML.parse(
                        fs.readFileSync(gameplayFile, "utf8")
                    );
                }

                const texturesRoot = path.join(namespaceRoot, "textures");
                for (const filename of files(texturesRoot)) {
                    const relative = path
                        .relative(texturesRoot, filename)
                        .replaceAll("\\", "/");
                    const logicalPath = `${namespace}/${relative}`;
                    pendingTextures.push({
                        logicalPath,
                        bytes: fs.readFileSync(filename),
                    });
                }

                const visualsRoot = path.join(namespaceRoot, "visuals");
                for (const filename of files(visualsRoot).filter((name) =>
                    /\.ya?ml$/i.test(name)
                )) {
                    const document = rewritePackTextureRefs(
                        record(
                            Bun.YAML.parse(fs.readFileSync(filename, "utf8")),
                            filename
                        )
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

        if (clientGameplayRaw === undefined) {
            throw new Error(
                "Resource packs: missing assets/<namespace>/gameplay.yml"
            );
        }
        // Validate at pack build time; client re-parses the snake_case document.
        parseClientGameplayConfig(clientGameplayRaw);
        const gameplayJson = JSON.stringify(clientGameplayRaw);

        const sanitized = await Promise.all(
            pendingTextures.map(({ logicalPath, bytes }) =>
                sanitizePackTexture(logicalPath, bytes)
            )
        );
        assertPackAssetBudget(sanitized);

        const servedAssets = new Map<string, ServedAsset>();
        for (const asset of sanitized) {
            if (servedAssets.has(asset.path)) {
                throw new Error(
                    `Duplicate sanitized texture path "${asset.path}" (same stem as another pack texture)`
                );
            }
            const contentHash = hash(asset.bytes);
            servedAssets.set(asset.path, {
                path: asset.path,
                hash: contentHash,
                size: asset.bytes.byteLength,
                bytes: asset.bytes,
            });
        }

        // Aggregate under one source key so per-id YAML maps compile as definitions
        // (same shape the client historically received as `{ stack }`).
        const compiledVisuals = compileVisualDefs({ stack: visuals });
        validateCompiledTextures(
            compiledVisuals,
            new Set(servedAssets.keys())
        );
        const payload: CompiledVisualsPayload = {
            format: 1,
            defs: Object.fromEntries(compiledVisuals),
        };
        const visualsJson = JSON.stringify(payload);
        const registries = gameRegistries();
        const projection: ClientRegistryProjection = {
            ...registryProjection(),
            structures: Object.fromEntries(
                [...BuildingConfigs.entries].map(([location, config]) => [
                    registries.structure.resolve(location),
                    config.placement,
                ])
            ),
            groundTypes: Object.fromEntries(
                [...GroundTypeConfigs.entries].map(([location, config]) => [
                    registries.ground_type.resolve(location),
                    { color: config.color },
                ])
            ),
        };
        const registriesJson = JSON.stringify(projection);
        const visualsHash = hash(visualsJson);
        const registriesHash = hash(registriesJson);
        const gameplayHash = hash(gameplayJson);
        const assets = [...servedAssets.values()]
            .map(({ bytes: _bytes, ...asset }) => asset)
            .sort((left, right) => left.path.localeCompare(right.path));
        const packEntries = packs.packs.map((pack) => ({
            id: pack.manifest.id,
            version: pack.manifest.version,
            format: pack.manifest.format,
            hash: hashPackResourceInputs(pack.directory),
        }));
        const fingerprint = hash(
            JSON.stringify({
                format: 2,
                packs: packEntries,
                visualsHash,
                registriesHash,
                gameplayHash,
                assets,
            })
        );

        return new ResourcePackService(
            {
                format: 2,
                fingerprint,
                packs: packEntries,
                visuals: { hash: visualsHash, url: "/packs/visuals.json" },
                registries: {
                    hash: registriesHash,
                    url: "/packs/registries.json",
                },
                gameplay: { hash: gameplayHash, url: "/packs/gameplay.json" },
                assets,
            },
            visualsJson,
            registriesJson,
            gameplayJson,
            compiledVisuals,
            servedAssets
        );
    }

    asset(logicalPath: string): ServedAsset | undefined {
        return this.servedAssets.get(logicalPath);
    }
}
