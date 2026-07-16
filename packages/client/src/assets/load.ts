import { Assets, type Texture } from "pixi.js";
import type { ResourceAssetSource } from "./resource_packs";

const loadedAssets = new Map<string, Texture>();
let unknownAsset: Texture;

export async function initAssets(
    sources: readonly ResourceAssetSource[]
): Promise<void> {
    const bundles = sources;

    await Assets.load(bundles.map((b) => b.src));

    loadedAssets.clear();
    for (const { path, src } of bundles) {
        loadedAssets.set(path, Assets.get(src));
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
