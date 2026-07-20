import type { ClientRegistryProjection } from "@bundu/shared/registry";
import type { CompiledModelDefs } from "@bundu/shared/models/compile";
import type { CompiledModelsPayload, ModelDef } from "@bundu/shared/models/types";
import {
    buildVariantMap,
    setVariantMap,
} from "@bundu/shared/variant_map";
import { applyClientGameplay } from "../models/shadow";
import { applyStatBars } from "../ui/stat_bars_config";
import { applyLang } from "../lang/lang";

export type ResourceAssetSource = {
    path: string;
    src: string;
};

export type LoadedResourcePacks = {
    fingerprint: string;
    assets: ResourceAssetSource[];
    modelDefs: CompiledModelDefs;
    registries: ClientRegistryProjection;
};

type ManifestAsset = {
    path: string;
    hash: string;
    size: number;
};

type Manifest = {
    format: 2;
    fingerprint: string;
    models: { hash: string; url: string };
    registries: { hash: string; url: string };
    gameplay: { hash: string; url: string };
    statBars: { hash: string; url: string };
    /** Optional so older format-2 servers without lang still load. */
    lang?: { hash: string; url: string };
    assets: ManifestAsset[];
};

const EMPTY_LANG = {
    format: 1 as const,
    locale: "en",
    strings: {} as Record<string, string>,
};

/** Same-origin sanitized bundu pack emitted by `scripts/bundle-base-pack.ts`. */
const BUNDLED_BASE_PACK_ROOT = "/site/base-pack/";

let objectUrls: string[] = [];

function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
    if (typeof value !== "string" || !value) {
        throw new Error(`${path}: expected a non-empty string`);
    }
    return value;
}

function parseManifest(value: unknown): Manifest {
    const raw = record(value, "pack manifest");
    if (raw.format !== 2) {
        throw new Error(`Unsupported resource pack format ${String(raw.format)}`);
    }
    const models = record(raw.models, "pack manifest.models");
    const registries = record(raw.registries, "pack manifest.registries");
    const gameplay = record(raw.gameplay, "pack manifest.gameplay");
    const statBars = record(raw.statBars ?? raw.stat_bars, "pack manifest.statBars");
    const langRaw = raw.lang;
    if (!Array.isArray(raw.assets)) {
        throw new Error("pack manifest.assets: expected an array");
    }
    const assets = raw.assets.map((value, index) => {
        const asset = record(value, `pack manifest.assets[${index}]`);
        if (
            typeof asset.size !== "number" ||
            !Number.isSafeInteger(asset.size) ||
            asset.size < 0
        ) {
            throw new Error(`pack manifest.assets[${index}].size: expected an integer`);
        }
        return {
            path: string(asset.path, `pack manifest.assets[${index}].path`),
            hash: string(asset.hash, `pack manifest.assets[${index}].hash`),
            size: asset.size,
        };
    });
    const manifest: Manifest = {
        format: 2,
        fingerprint: string(raw.fingerprint, "pack manifest.fingerprint"),
        models: {
            hash: string(models.hash, "pack manifest.models.hash"),
            url: string(models.url, "pack manifest.models.url"),
        },
        registries: {
            hash: string(registries.hash, "pack manifest.registries.hash"),
            url: string(registries.url, "pack manifest.registries.url"),
        },
        gameplay: {
            hash: string(gameplay.hash, "pack manifest.gameplay.hash"),
            url: string(gameplay.url, "pack manifest.gameplay.url"),
        },
        statBars: {
            hash: string(statBars.hash, "pack manifest.statBars.hash"),
            url: string(statBars.url, "pack manifest.statBars.url"),
        },
        assets,
    };
    if (langRaw !== undefined) {
        const lang = record(langRaw, "pack manifest.lang");
        manifest.lang = {
            hash: string(lang.hash, "pack manifest.lang.hash"),
            url: string(lang.url, "pack manifest.lang.url"),
        };
    }
    return manifest;
}

function parseCompiledModels(value: unknown): CompiledModelDefs {
    const raw = record(value, "model definitions");
    if (raw.format !== 2) {
        throw new Error(
            `Unsupported compiled models format ${String(raw.format)}`
        );
    }
    const defs = record(raw.defs, "model definitions.defs") as Record<
        string,
        ModelDef
    >;
    const variantMapping =
        raw.variants !== undefined
            ? parseVariantMapping(raw.variants, "model definitions.variants")
            : buildVariantMap(Object.values(defs));
    setVariantMap(variantMapping);
    const payload = {
        format: 2 as const,
        defs,
        variants: variantMapping,
    } satisfies CompiledModelsPayload;
    return new Map(Object.entries(payload.defs));
}

function parseVariantMapping(
    value: unknown,
    path: string
): Record<string, number> {
    const raw = record(value, path);
    const result: Record<string, number> = {};
    for (const [name, id] of Object.entries(raw)) {
        if (typeof id !== "number" || !Number.isInteger(id) || id < 0) {
            throw new Error(`${path}.${name}: expected a non-negative integer`);
        }
        result[name] = id;
    }
    return result;
}

async function sha256(data: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function verified(url: URL, expectedHash: string, size?: number) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download ${url.pathname} (${response.status})`);
    }
    const data = await response.arrayBuffer();
    if (size !== undefined && data.byteLength !== size) {
        throw new Error(`${url.pathname}: expected ${size} bytes, got ${data.byteLength}`);
    }
    const actualHash = await sha256(data);
    if (actualHash !== expectedHash) {
        throw new Error(`${url.pathname}: checksum mismatch`);
    }
    return data;
}

/** HTTP base of the game server, preserving any path prefix from GAME_WS_URL. */
function httpBase(websocketUrl: string): URL {
    const base = new URL(websocketUrl);
    base.protocol = base.protocol === "wss:" ? "https:" : "http:";
    base.search = "";
    base.hash = "";
    // Trailing slash so relative pack paths append under the WS path prefix.
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return base;
}

/** Resolve a pack path under the game server base (not the site origin root). */
function packUrl(base: URL, path: string): URL {
    return new URL(path.replace(/^\//, ""), base);
}

function assetUrl(base: URL, path: string): URL {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return packUrl(base, `/packs/assets/${encoded}`);
}

function bundledRootUrl(): URL {
    return new URL(BUNDLED_BASE_PACK_ROOT, window.location.origin);
}

function bundledUrl(path: string): URL {
    return new URL(path.replace(/^\//, ""), bundledRootUrl());
}

function bundledAssetUrl(path: string): URL {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return bundledUrl(`assets/${encoded}`);
}

function revokeObjectUrls() {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
}

async function fetchManifest(websocketUrl: string): Promise<Manifest> {
    const response = await fetch(
        packUrl(httpBase(websocketUrl), "/packs/manifest.json"),
        { cache: "no-store" }
    );
    if (!response.ok) {
        throw new Error(`Failed to negotiate resource packs (${response.status})`);
    }
    return parseManifest(await response.json());
}

async function fetchBundledBaseManifest(): Promise<Manifest | undefined> {
    try {
        const response = await fetch(bundledUrl("manifest.json"), {
            cache: "no-store",
        });
        if (!response.ok) return undefined;
        return parseManifest(await response.json());
    } catch {
        return undefined;
    }
}

async function materializePack(
    manifest: Manifest,
    resolveModels: URL,
    resolveRegistries: URL,
    resolveGameplay: URL,
    resolveStatBars: URL,
    resolveLang: URL | undefined,
    resolveAsset: (path: string) => URL,
    /** Game-server assets are content-addressed with ?hash=; bundled files are not. */
    contentAddressed: boolean
): Promise<LoadedResourcePacks> {
    const modelsUrl = new URL(resolveModels);
    const registryUrl = new URL(resolveRegistries);
    const gameplayUrl = new URL(resolveGameplay);
    const statBarsUrl = new URL(resolveStatBars);
    const langUrl =
        resolveLang && manifest.lang ? new URL(resolveLang) : undefined;
    if (contentAddressed) {
        modelsUrl.searchParams.set("hash", manifest.models.hash);
        registryUrl.searchParams.set("hash", manifest.registries.hash);
        gameplayUrl.searchParams.set("hash", manifest.gameplay.hash);
        statBarsUrl.searchParams.set("hash", manifest.statBars.hash);
        if (langUrl && manifest.lang) {
            langUrl.searchParams.set("hash", manifest.lang.hash);
        }
    }
    const [modelsData, registryData, gameplayData, statBarsData, langData] =
        await Promise.all([
            verified(modelsUrl, manifest.models.hash),
            verified(registryUrl, manifest.registries.hash),
            verified(gameplayUrl, manifest.gameplay.hash),
            verified(statBarsUrl, manifest.statBars.hash),
            langUrl && manifest.lang
                ? verified(langUrl, manifest.lang.hash)
                : Promise.resolve(undefined),
        ]);
    const modelDefs = parseCompiledModels(
        JSON.parse(new TextDecoder().decode(modelsData))
    );
    const registries = record(
        JSON.parse(new TextDecoder().decode(registryData)),
        "registry projection"
    ) as ClientRegistryProjection;
    applyClientGameplay(JSON.parse(new TextDecoder().decode(gameplayData)));
    applyStatBars(JSON.parse(new TextDecoder().decode(statBarsData)));
    if (langData) {
        applyLang(JSON.parse(new TextDecoder().decode(langData)));
    } else {
        applyLang(EMPTY_LANG);
    }

    revokeObjectUrls();
    const assets = await Promise.all(
        manifest.assets.map(async (asset) => {
            const url = resolveAsset(asset.path);
            if (contentAddressed) {
                url.searchParams.set("hash", asset.hash);
            }
            const data = await verified(url, asset.hash, asset.size);
            // Server sanitization re-encodes every pack texture as PNG.
            const src = URL.createObjectURL(
                new Blob([new Uint8Array(data)], { type: "image/png" })
            );
            objectUrls.push(src);
            return { path: asset.path, src };
        })
    );

    return {
        fingerprint: manifest.fingerprint,
        modelDefs,
        registries,
        assets,
    };
}

export async function getResourcePackFingerprint(
    websocketUrl: string
): Promise<string> {
    return (await fetchManifest(websocketUrl)).fingerprint;
}

export async function loadResourcePacks(
    websocketUrl: string
): Promise<LoadedResourcePacks> {
    const base = httpBase(websocketUrl);
    const manifest = await fetchManifest(websocketUrl);
    const bundled = await fetchBundledBaseManifest();
    if (bundled && bundled.fingerprint === manifest.fingerprint) {
        try {
            console.debug(
                "Using client-bundled base pack",
                manifest.fingerprint.slice(0, 12)
            );
            // Use server-advertised hashes; only the fetch URLs are same-origin.
            // On stale CDN/browser cache, fall through to the content-addressed server.
            return await materializePack(
                manifest,
                bundledUrl(bundled.models.url),
                bundledUrl(bundled.registries.url),
                bundledUrl(bundled.gameplay.url),
                bundledUrl(bundled.statBars.url),
                bundled.lang ? bundledUrl(bundled.lang.url) : undefined,
                bundledAssetUrl,
                false
            );
        } catch (error) {
            console.warn(
                "Bundled base pack failed verification; falling back to server",
                error
            );
        }
    }

    return materializePack(
        manifest,
        packUrl(base, manifest.models.url),
        packUrl(base, manifest.registries.url),
        packUrl(base, manifest.gameplay.url),
        packUrl(base, manifest.statBars.url),
        manifest.lang ? packUrl(base, manifest.lang.url) : undefined,
        (path) => assetUrl(base, path),
        true
    );
}
