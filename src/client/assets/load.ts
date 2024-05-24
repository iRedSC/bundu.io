import SpriteMap from "../configs/sprite_map.yml";
import {
    MIPMAP_MODES,
    Resource,
    SCALE_MODES,
    Texture,
    autoDetectResource,
} from "pixi.js";

/**
 *
 * @param name Retrieves a specific asset file
 * @returns
 */
async function getTexture(name: string): Promise<Texture<Resource>> {
    const texture = Texture.from(`./assets/${name}`, {
        mipmap: MIPMAP_MODES.ON,
        scaleMode: SCALE_MODES.LINEAR,
        anisotropicLevel: 16,
        resourceOptions: {
            width: 500,
            height: 500,
        },
    });
    return texture;
}

async function loadAssets(): Promise<Map<string, Texture>> {
    const promises: Promise<Texture>[] = [];
    const assetMap = new Map<string, Promise<Texture>>();

    for (const [key, value] of Object.entries(SpriteMap)) {
        const promise = getTexture(value);
        promises.push(promise);
        assetMap.set(key, promise);
    }

    const resolved = await Promise.all(promises);
    const result = new Map<string, Texture>();

    // Convert the resolved array back to a map with the original keys
    for (let i = 0; i < resolved.length; i++) {
        result.set([...assetMap.keys()][i], resolved[i]);
    }

    return result;
}

const loadedAssets: Map<string, Texture> = await loadAssets();
const unknownAsset = Texture.from(`./`, {
    mipmap: MIPMAP_MODES.ON,
});
function getAsset(asset: string) {
    const loadedAsset = loadedAssets.get(asset);
    return loadedAsset || unknownAsset;
}

export const assets: (asset: string) => Texture = getAsset;
