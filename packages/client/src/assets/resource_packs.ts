import type { ClientRegistryProjection } from "@bundu/shared/registry";
import type { VisualDefs } from "../visual/defs";

export type ResourceAssetSource = {
    path: string;
    src: string;
};

export type LoadedResourcePacks = {
    fingerprint: string;
    assets: ResourceAssetSource[];
    visualDefs: VisualDefs;
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

async function sha256(data: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function verified(url: URL, expectedHash: string, size?: number) {
    url.searchParams.set("hash", expectedHash);
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

function mimeFor(path: string): string {
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    if (ext === "svg") return "image/svg+xml";
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "webp") return "image/webp";
    if (ext === "avif") return "image/avif";
    if (ext === "gif") return "image/gif";
    return "application/octet-stream";
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
    const visualUrl = packUrl(base, manifest.visuals.url);
    const registryUrl = packUrl(base, manifest.registries.url);
    const [visualData, registryData] = await Promise.all([
        verified(visualUrl, manifest.visuals.hash),
        verified(registryUrl, manifest.registries.hash),
    ]);
    const visualRaw: unknown = JSON.parse(new TextDecoder().decode(visualData));
    const registryRaw: unknown = JSON.parse(
        new TextDecoder().decode(registryData)
    );
    const visualDefs = record(visualRaw, "visual definitions") as VisualDefs;
    const registries = record(
        registryRaw,
        "registry projection"
    ) as ClientRegistryProjection;

    revokeObjectUrls();
    const assets = await Promise.all(
        manifest.assets.map(async (asset) => {
            const data = await verified(assetUrl(base, asset.path), asset.hash, asset.size);
            const src = URL.createObjectURL(
                new Blob([new Uint8Array(data)], { type: mimeFor(asset.path) })
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
