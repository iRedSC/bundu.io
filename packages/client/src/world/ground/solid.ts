import { Container, Sprite, Texture, type Rectangle } from "pixi.js";
import type { SolidGroundFill } from "@bundu/shared/ground_models";
import { WORLD_TILES } from "@bundu/shared/tiles";
import type { GroundFieldTextures } from "./ground_fields";
import {
    OrganicLandFilter,
    organicLandSpriteRect,
} from "./organic_land_filter";
import type { GroundVisual } from "./types";

let sharedFields: GroundFieldTextures | undefined;

/** World installs field textures before creating / refreshing land visuals. */
export function setSolidGroundFields(fields: GroundFieldTextures): void {
    sharedFields = fields;
}

export function createSolidGround(
    color: number,
    bounds: Rectangle,
    zIndex: number,
    fill?: SolidGroundFill
): GroundVisual {
    const root = new Container();
    root.zIndex = zIndex;

    const fields = sharedFields;
    if (!fields) {
        // Fallback hard rect if fields are not ready yet (should be rare).
        const flat = new Sprite(Texture.WHITE);
        flat.tint = color;
        flat.position.set(bounds.x, bounds.y);
        flat.width = bounds.width;
        flat.height = bounds.height;
        root.addChild(flat);
        return {
            container: root,
            destroy() {
                root.destroy({ children: true });
            },
        };
    }

    const rect = organicLandSpriteRect(bounds);
    const sprite = new Sprite(Texture.WHITE);
    sprite.position.set(rect.x, rect.y);
    sprite.width = rect.w;
    sprite.height = rect.h;
    const filter = new OrganicLandFilter({
        bounds,
        color,
        fill,
        fields,
        worldTiles: WORLD_TILES,
    });
    sprite.filters = [filter];
    root.addChild(sprite);

    return {
        container: root,
        bindGroundFields(next) {
            filter.bindFields(next);
            filter.setWorldTiles(WORLD_TILES);
        },
        destroy() {
            sprite.filters = null;
            filter.destroy();
            root.destroy({ children: true });
        },
    };
}
