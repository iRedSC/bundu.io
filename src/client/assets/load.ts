import SpriteMap from "../configs/sprites.yml";
import * as PIXI from "pixi.js";

async function getTexture(name: string) {
    return PIXI.Texture.from(`./assets/${name}.svg`, {
        mipmap: PIXI.MIPMAP_MODES.ON,
    });
}

async function loadAssets(): Promise<Map<string, PIXI.Texture>> {
    const promises: Promise<PIXI.Texture>[] = [];
    const assetMap = new Map<string, Promise<PIXI.Texture>>();

    for (const [key, value] of Object.entries(SpriteMap)) {
        const promise = getTexture(value);
        promises.push(promise);
        assetMap.set(key, promise);
    }

    const resolved = await Promise.all(promises);
    const result = new Map<string, PIXI.Texture>();

    // Convert the resolved array back to a map with the original keys
    for (let i = 0; i < resolved.length; i++) {
        result.set([...assetMap.keys()][i], resolved[i]);
    }

    return result;
}

// function getTexture(name: string) {
//     return PIXI.Texture.from(`./assets/${name}.svg`, {
//         mipmap: PIXI.MIPMAP_MODES.ON,
//     });
// }

// function loadAssets(): Map<string, PIXI.Texture> {
//     const assetMap = new Map<string, PIXI.Texture>();

//     for (const [key, value] of Object.entries(SpriteMap)) {
//         const texture = getTexture(value);
//         assetMap.set(key, texture);
//     }

//     return assetMap;
// }

export const assets: Map<string, PIXI.Texture> = await loadAssets();
