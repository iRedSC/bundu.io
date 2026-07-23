import { Container, Sprite, Texture, type Rectangle } from "pixi.js";
import type { SolidGroundFill } from "@bundu/shared/ground_models";
import { WORLD_TILES } from "@bundu/shared/tiles";
import type { GroundFieldTextures } from "./ground_fields";
import { createOrganicLandMesh } from "./organic_land_mesh";
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

    const land = createOrganicLandMesh({
        bounds,
        color,
        fill,
        fields,
        worldTiles: WORLD_TILES,
    });
    root.addChild(land.mesh);

    return {
        container: root,
        bindGroundFields(next) {
            land.bindFields(next);
            land.setWorldTiles(WORLD_TILES);
        },
        destroy() {
            land.destroy();
            root.destroy({ children: true });
        },
    };
}
