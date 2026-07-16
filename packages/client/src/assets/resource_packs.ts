import type { VisualDefs } from "../visual/defs";

export type ResourceAssetSource = {
    path: string;
    src: string;
};

export type LoadedResourcePacks = {
    fingerprint: string;
    assets: ResourceAssetSource[];
    visualDefs: VisualDefs;
};

type ManifestAsset = {
    path: string;
    hash: string;
    size: number;
};

type Manifest = {
    format: 1;
    fingerprint: string;
    visuals: { hash: string; url: string };
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
    if (raw.format !== 1) {
        throw new Error(`Unsupported resource pack format ${String(raw.format)}`);
    }
    const visuals = record(raw.visuals, "pack manifest.visuals");
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
        format: 1,
        fingerprint: string(raw.fingerprint, "pack manifest.fingerprint"),
        visuals: {
            hash: string(visuals.hash, "pack manifest.visuals.hash"),
            url: string(visuals.url, "pack manifest.visuals.url"),
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

function httpOrigin(websocketUrl: string): URL {
    const origin = new URL(websocketUrl);
    origin.protocol = origin.protocol === "wss:" ? "https:" : "http:";
    return origin;
}

function assetUrl(origin: URL, path: string): URL {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return new URL(`/packs/assets/${encoded}`, origin);
}

function revokeObjectUrls() {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
}

async function fetchManifest(websocketUrl: string): Promise<Manifest> {
    const response = await fetch(
        new URL("/packs/manifest.json", httpOrigin(websocketUrl)),
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
    const origin = httpOrigin(websocketUrl);
    const manifest = await fetchManifest(websocketUrl);
    const visualUrl = new URL(manifest.visuals.url, origin);
    const visualData = await verified(visualUrl, manifest.visuals.hash);
    const visualRaw: unknown = JSON.parse(new TextDecoder().decode(visualData));
    const visualDefs = record(visualRaw, "visual definitions") as VisualDefs;

    revokeObjectUrls();
    const assets = await Promise.all(
        manifest.assets.map(async (asset) => {
            const data = await verified(assetUrl(origin, asset.path), asset.hash, asset.size);
            const src = URL.createObjectURL(new Blob([new Uint8Array(data)]));
            objectUrls.push(src);
            return { path: asset.path, src };
        })
    );

    return {
        fingerprint: manifest.fingerprint,
        visualDefs,
        assets,
    };
}
