import { Container, Graphics } from "pixi.js";
import { TILE_SIZE, WORLD_BOUNDS } from "@bundu/shared/tiles";

/**
 * World-space tile grid for the freecam editor.
 * Uses `pixelLine` so 1px strokes stay visible when zoomed out.
 */
export function createTileGridOverlay(): {
    container: Container;
    setVisible: (visible: boolean) => void;
    destroy: () => void;
} {
    const container = new Container();
    container.label = "admin-tile-grid";
    container.zIndex = -1;
    container.eventMode = "none";
    container.visible = false;

    const grid = new Graphics();
    grid.eventMode = "none";
    for (let x = 0; x <= WORLD_BOUNDS; x += TILE_SIZE) {
        grid.moveTo(x, 0);
        grid.lineTo(x, WORLD_BOUNDS);
    }
    for (let y = 0; y <= WORLD_BOUNDS; y += TILE_SIZE) {
        grid.moveTo(0, y);
        grid.lineTo(WORLD_BOUNDS, y);
    }
    grid.stroke({ width: 1, color: 0xffffff, alpha: 0.25, pixelLine: true });
    container.addChild(grid);

    return {
        container,
        setVisible(visible: boolean) {
            container.visible = visible;
        },
        destroy() {
            container.destroy({ children: true });
        },
    };
}
