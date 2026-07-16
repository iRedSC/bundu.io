import { getStringId } from "@bundu/shared/id_map";
import SpriteMap from "../configs/sprite_map.yml";
import { Assets, type Texture } from "pixi.js";

const loadedAssets = new Map<string, Texture>();
let unknownAsset: Texture;

export async function initAssets(): Promise<void> {
    const bundles = Object.entries(SpriteMap).map(([key, value]) => ({
        alias: key,
        src: `./assets/${value}`,
    }));

    await Assets.load(bundles.map((b) => b.src));

    for (const { alias, src } of bundles) {
        loadedAssets.set(alias, Assets.get(src));
    }

    const fallback = loadedAssets.get("unknown_asset");
    if (!fallback) throw new Error("Missing unknown_asset");
    unknownAsset = fallback;
    console.debug("Assets loaded");
}

export function getAsset(asset?: string | number): Texture {
    if (typeof asset === "number") asset = getStringId(asset);
    if (!asset) return unknownAsset;
    return loadedAssets.get(asset) || unknownAsset;
}
