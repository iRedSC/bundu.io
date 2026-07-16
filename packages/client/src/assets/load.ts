import { Assets, Texture } from "pixi.js";
import type { ResourceAssetSource } from "./resource_packs";

const loadedAssets = new Map<string, Texture>();
let unknownAsset: Texture;

function parserFor(path: string): "svg" | "texture" {
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    if (ext === "svg") return "svg";
    if (
        ext === "png" ||
        ext === "jpg" ||
        ext === "jpeg" ||
        ext === "webp" ||
        ext === "avif" ||
        ext === "gif"
    ) {
        return "texture";
    }
    throw new Error(`Unsupported pack texture type: ${path}`);
}

export async function initAssets(
    sources: readonly ResourceAssetSource[]
): Promise<void> {
    await Assets.load(
        sources.map(({ path, src }) => ({
            alias: path,
            src,
            parser: parserFor(path),
        }))
    );

    loadedAssets.clear();
    for (const { path } of sources) {
        const texture = Assets.get(path);
        if (!(texture instanceof Texture)) {
            throw new Error(`Failed to load pack texture: ${path}`);
        }
        loadedAssets.set(path, texture);
    }

    const fallback = loadedAssets.get("bundu/misc/unknown_asset.svg");
    if (!fallback) throw new Error("Missing unknown_asset");
    unknownAsset = fallback;
    console.debug("Assets loaded");
}

export function getAsset(asset?: string): Texture {
    if (!asset) return unknownAsset;
    return loadedAssets.get(asset) || unknownAsset;
}
