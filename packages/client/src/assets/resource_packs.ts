import type { ClientRegistryProjection } from "@bundu/shared/registry";
import type { CompiledVisualDefs } from "@bundu/shared/visual/compile";
import type { CompiledVisualsPayload, VisualDef } from "@bundu/shared/visual/types";

export type ResourceAssetSource = {
    path: string;
    src: string;
};

export type LoadedResourcePacks = {
    fingerprint: string;
    assets: ResourceAssetSource[];
    visualDefs: CompiledVisualDefs;
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
    visuals: { hash: string; url: string };
    registries: { hash: string; url: string };
    assets: ManifestAsset[];
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
    const visuals = record(raw.visuals, "pack manifest.visuals");
    const registries = record(raw.registries, "pack manifest.registries");
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
    return {
        format: 2,
        fingerprint: string(raw.fingerprint, "pack manifest.fingerprint"),
        visuals: {
            hash: string(visuals.hash, "pack manifest.visuals.hash"),
            url: string(visuals.url, "pack manifest.visuals.url"),
        },
        registries: {
            hash: string(registries.hash, "pack manifest.registries.hash"),
            url: string(registries.url, "pack manifest.registries.url"),
        },
        assets,
    };
}

function parseCompiledVisuals(value: unknown): CompiledVisualDefs {
    const raw = record(value, "visual definitions");
    if (raw.format !== 1) {
        throw new Error(
            `Unsupported compiled visuals format ${String(raw.format)}`
        );
    }
    const defs = record(raw.defs, "visual definitions.defs") as Record<
        string,
        VisualDef
    >;
    const payload = { format: 1 as const, defs } satisfies CompiledVisualsPayload;
    return new Map(Object.entries(payload.defs));
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
    resolveVisuals: URL,
    resolveRegistries: URL,
    resolveAsset: (path: string) => URL,
    /** Game-server assets are content-addressed with ?hash=; bundled files are not. */
    contentAddressed: boolean
): Promise<LoadedResourcePacks> {
    const visualUrl = new URL(resolveVisuals);
    const registryUrl = new URL(resolveRegistries);
    if (contentAddressed) {
        visualUrl.searchParams.set("hash", manifest.visuals.hash);
        registryUrl.searchParams.set("hash", manifest.registries.hash);
    }
    const [visualData, registryData] = await Promise.all([
        verified(visualUrl, manifest.visuals.hash),
        verified(registryUrl, manifest.registries.hash),
    ]);
    const visualDefs = parseCompiledVisuals(
        JSON.parse(new TextDecoder().decode(visualData))
    );
    const registries = record(
        JSON.parse(new TextDecoder().decode(registryData)),
        "registry projection"
    ) as ClientRegistryProjection;

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
        visualDefs,
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
                bundledUrl(bundled.visuals.url),
                bundledUrl(bundled.registries.url),
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
        packUrl(base, manifest.visuals.url),
        packUrl(base, manifest.registries.url),
        (path) => assetUrl(base, path),
        true
    );
}
